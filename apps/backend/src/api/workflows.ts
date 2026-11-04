import type { FastifyInstance } from 'fastify';
import type { Action, Platform } from '../core/types.js';
import type { StepDefinitionStore } from '../workflows/step-definitions.js';
import { loadStepForms } from '../workflows/step-forms.js';
import type { WorkflowPlan } from '../workflows/workflow-plan.js';
import type { WorkflowRegistry } from '../workflows/workflow-registry.js';
import type { WorkflowPlanStore } from '../workflows/workflow-store.js';
import { compileWorkflow } from '../workflows/workflow-yaml.js';

/** Workflow authoring routes: templates, plans, step definitions, registry CRUD, YAML previews. */
export function registerWorkflowRoutes(
  app: FastifyInstance,
  workflowPlans: WorkflowPlanStore,
  workflowRegistry: WorkflowRegistry,
  authoredSteps: StepDefinitionStore,
) {
  app.get<{ Params: { platform: Platform } }>(
    '/workflow-templates/:platform',
    async (request, reply) => {
      if (!['linkedin', 'x'].includes(request.params.platform))
        return reply.code(400).send({ error: 'Unknown platform' });
      return workflowPlans.listTemplates(request.params.platform);
    },
  );
  app.get<{ Params: { platform: Platform; action: Action } }>(
    '/workflow-plans/:platform/:action',
    async (request, reply) => {
      try {
        return await workflowPlans.get(request.params.platform, request.params.action);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid workflow',
        });
      }
    },
  );
  app.put<{
    Params: { platform: Platform; action: Action };
    Body: WorkflowPlan;
  }>('/workflow-plans/:platform/:action', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    try {
      const definitions = await authoredSteps.resolve(request.body);
      compileWorkflow(request.body, definitions);
      return await workflowPlans.save(request.params.platform, request.params.action, request.body);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid workflow',
      });
    }
  });
  // Immutable authored YAML definitions: allowlisted operations only.
  app.get('/step-forms', async () => loadStepForms());
  app.get('/step-definitions', async () => authoredSteps.list());
  app.get<{ Params: { id: string; version: string } }>(
    '/step-definitions/:id/versions/:version',
    async (request, reply) => {
      try {
        const record = await authoredSteps.get(request.params.id, Number(request.params.version));
        return record || reply.code(404).send({ error: 'Step definition not found' });
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid step definition',
        });
      }
    },
  );
  app.post<{ Body: { yaml: string } }>(
    '/step-definitions',
    { bodyLimit: 16 * 1024 },
    async (request, reply) => {
      try {
        return reply.code(201).send(await authoredSteps.create(request.body?.yaml));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid YAML step definition';
        return reply
          .code((error as NodeJS.ErrnoException).code === 'EEXIST' ? 409 : 400)
          .send({ error: message });
      }
    },
  );
  // Unique, revisioned user workflows. Legacy platform/action endpoints remain usable.
  app.get('/workflows', async () => workflowRegistry.list());
  app.post<{ Body: { plan: WorkflowPlan; templateId?: string } }>(
    '/workflows',
    { bodyLimit: 128 * 1024 },
    async (request, reply) => {
      try {
        const definitions = await authoredSteps.resolve(request.body?.plan);
        compileWorkflow(request.body.plan, definitions);
        const record = await workflowRegistry.create(request.body?.plan, request.body?.templateId);
        return reply.code(201).send(record);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid workflow',
        });
      }
    },
  );
  app.get<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
    try {
      return (
        (await workflowRegistry.get(request.params.id)) ||
        reply.code(404).send({ error: 'Workflow not found' })
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid workflow',
      });
    }
  });
  app.get<{ Params: { id: string; revision: string } }>(
    '/workflows/:id/revisions/:revision',
    async (request, reply) => {
      try {
        const revision = Number(request.params.revision);
        return (
          (await workflowRegistry.get(request.params.id, revision)) ||
          reply.code(404).send({ error: 'Workflow revision not found' })
        );
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid workflow revision',
        });
      }
    },
  );
  app.put<{
    Params: { id: string };
    Body: { plan: WorkflowPlan; expectedRevision: number };
  }>('/workflows/:id', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    try {
      const definitions = await authoredSteps.resolve(request.body?.plan);
      compileWorkflow(request.body.plan, definitions);
      return await workflowRegistry.update(
        request.params.id,
        request.body?.expectedRevision,
        request.body?.plan,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid workflow';
      return reply
        .code(
          message.startsWith('Version conflict') ? 409 : message === 'Workflow not found' ? 404 : 400,
        )
        .send({ error: message });
    }
  });
  app.get<{ Params: { id: string } }>('/workflows/:id/yaml', async (request, reply) => {
    try {
      const record = await workflowRegistry.get(request.params.id);
      if (!record) return reply.code(404).send({ error: 'Workflow not found' });
      const compiled = compileWorkflow(record.plan, await authoredSteps.resolve(record.plan));
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/yaml; charset=utf-8')
        .send(compiled.yaml);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid workflow',
      });
    }
  });
  // YAML is generated from the validated and versioned execution graph, never
  // parsed from arbitrary browser snapshots or untrusted freeform content.
  app.get<{ Params: { platform: Platform; action: Action } }>(
    '/workflow-plans/:platform/:action/yaml',
    async (request, reply) => {
      try {
        const plan = await workflowPlans.get(request.params.platform, request.params.action);
        const compiled = compileWorkflow(plan, await authoredSteps.resolve(plan));
        return reply
          .header('Cache-Control', 'private, no-store')
          .header('X-Content-Type-Options', 'nosniff')
          .type('text/yaml; charset=utf-8')
          .send(compiled.yaml);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid workflow',
        });
      }
    },
  );
  app.get<{ Params: { platform: Platform; action: Action; stepId: string } }>(
    '/workflow-plans/:platform/:action/steps/:stepId/yaml',
    async (request, reply) => {
      try {
        const plan = await workflowPlans.get(request.params.platform, request.params.action);
        const compiled = compileWorkflow(plan, await authoredSteps.resolve(plan));
        const step = compiled.steps.find((item) => item.source.id === request.params.stepId);
        if (!step) return reply.code(404).send({ error: 'Workflow step not found' });
        return reply
          .header('Cache-Control', 'private, no-store')
          .header('X-Content-Type-Options', 'nosniff')
          .type('text/yaml; charset=utf-8')
          .send(step.yaml);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid workflow',
        });
      }
    },
  );
}
