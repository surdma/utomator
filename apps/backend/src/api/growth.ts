import type { FastifyInstance } from 'fastify';
import type { ConnectorService } from '../connect/service.js';
import {
  readGrowthProfileWorkflow,
  readGrowthTemplate,
  readGrowthTemplateCatalog,
} from '../engine/growth-profile.js';
import type { GrowthTemplateStore, StoredGrowthTemplate } from '../engine/growth-template-store.js';
import type { ProfileGrowthCoordinator } from '../engine/profile-growth-coordinator.js';

/**
 * Growth routes. Growth = data-driven YAML programs over the one Runner; every
 * mutating run here goes through human checkpoints downstream. No per-Growth
 * pages or controllers exist by design — templates are discovered dynamically.
 */
export function registerGrowthRoutes(
  app: FastifyInstance,
  growthProfileRuns: ProfileGrowthCoordinator,
  connectors: ConnectorService,
  growthTemplates: GrowthTemplateStore,
  /** Trusted server-side owner principal. */
  ownerId: string,
) {
  // Data-driven Growth template discovery. Stored owner-scoped templates
  // supplement the read-only file-backed YAML catalogue. No dedicated page
  // or controller per Growth — templates are discovered dynamically.
  app.get<{ Querystring: { ownerId?: string } }>('/growth/templates', async (_request, reply) => {
    try {
      const fileCatalog = await readGrowthTemplateCatalog();
      const stored = await growthTemplates.list();
      const templates = [
        ...fileCatalog.map(({ program }) => ({
          id: program.id,
          title: program.title,
          objective: program.objective,
          platform: 'linkedin',
          pipelineCount: program.stages.length,
          coverageCount: program.coverage.length,
          executable: program.kind !== 'GrowthBlueprintWorkflow',
          source: 'file',
        })),
        ...stored.map((template) => ({
          id: template.id,
          title: template.program.title,
          objective: template.program.objective,
          platform: 'linkedin',
          pipelineCount: (template.program.stages as unknown[]).length,
          coverageCount: (template.program.coverage as unknown[]).length,
          executable: template.program.kind !== 'GrowthBlueprintWorkflow',
          source: 'stored',
          version: template.version,
        })),
      ];
      return reply.header('Cache-Control', 'private, no-store').send(templates);
    } catch (error) {
      app.log.error({ error }, 'Growth template catalogue failed');
      return reply.code(500).send({ error: 'Growth templates unavailable' });
    }
  });
  app.get<{ Params: { id: string } }>('/growth/templates/:id/yaml', async (request, reply) => {
    try {
      const template = await readGrowthTemplate(request.params.id);
      if (!template) return reply.code(404).send({ error: 'Growth template not found' });
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/yaml; charset=utf-8')
        .send(template.yaml);
    } catch (error) {
      app.log.error({ error }, 'Growth YAML source unavailable');
      return reply.code(500).send({ error: 'Growth YAML source unavailable' });
    }
  });
  app.get<{ Params: { id: string } }>('/growth/templates/:id', async (request, reply) => {
    try {
      const template = await readGrowthTemplate(request.params.id);
      if (!template) return reply.code(404).send({ error: 'Growth template not found' });
      return reply.header('Cache-Control', 'private, no-store').send(template.program);
    } catch (error) {
      app.log.error({ error }, 'Growth YAML template could not be loaded');
      return reply.code(500).send({ error: 'Growth template unavailable' });
    }
  });
  // Unified YAML Growth templates use the same Runner and coordinator, not per-Growth controllers.
  app.get<{ Params: { id: string } }>('/growth/templates/:id/runs', async (request, reply) => {
    const definition = await readGrowthTemplate(request.params.id);
    if (!definition) return reply.code(404).send({ error: 'Growth template not found' });
    return (await growthProfileRuns.list()).filter((run) => run.programId === request.params.id);
  });
  app.get<{ Params: { id: string; runId: string } }>(
    '/growth/templates/:id/runs/:runId',
    async (request, reply) => {
      const run = await growthProfileRuns.get(request.params.runId);
      return run?.programId === request.params.id
        ? run
        : reply.code(404).send({ error: 'Growth run not found' });
    },
  );
  app.post<{ Params: { id: string }; Body: { accountId: string } }>(
    '/growth/templates/:id/runs',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['accountId'],
          properties: {
            accountId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const definition = await readGrowthTemplate(request.params.id);
        if (!definition) return reply.code(404).send({ error: 'Growth template not found' });
        if (definition.program.kind === 'GrowthBlueprintWorkflow')
          return reply
            .code(409)
            .send({ error: 'This YAML is a design-only workflow; provider execution is unavailable' });
        const account = await connectors.requireConnected(request.body.accountId, 'linkedin');
        return reply
          .code(202)
          .send(await growthProfileRuns.start(account.id, account.profileUrl, request.params.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Growth pipeline failed to start';
        return reply.code(message.startsWith('BUSY:') ? 409 : 400).send({ error: message });
      }
    },
  );
  app.post<{
    Params: { id: string; runId: string };
    Body: { sectionId: string; text: string };
  }>(
    '/growth/templates/:id/runs/:runId/evidence',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['sectionId', 'text'],
          properties: {
            sectionId: { type: 'string', pattern: '^[a-z][a-zA-Z0-9]*$' },
            text: { type: 'string', minLength: 10, maxLength: 1500 },
          },
        },
      },
    },
    async (request, reply) => {
      const run = await growthProfileRuns.get(request.params.runId);
      if (!run || run.programId !== request.params.id)
        return reply.code(404).send({ error: 'Growth run not found' });
      try {
        await connectors.requireConnected(run.accountId, 'linkedin', run.profileUrl);
        return await growthProfileRuns.supplyEvidence(run.id, request.body);
      } catch (error) {
        return reply.code(409).send({
          error: error instanceof Error ? error.message : 'Evidence rejected',
        });
      }
    },
  );
  app.post<{ Params: { id: string; runId: string } }>(
    '/growth/templates/:id/runs/:runId/advance',
    async (request, reply) => {
      const run = await growthProfileRuns.get(request.params.runId);
      if (!run || run.programId !== request.params.id)
        return reply.code(404).send({ error: 'Growth run not found' });
      try {
        await connectors.requireConnected(run.accountId, 'linkedin', run.profileUrl);
        return await growthProfileRuns.advance(run.id);
      } catch (error) {
        return reply.code(409).send({
          error: error instanceof Error ? error.message : 'Growth pipeline cannot advance',
        });
      }
    },
  );
  // YAML-authored Growth program: existing Runner remains the only executor.
  app.get('/growth/workflows/profile', async (_request, reply) => {
    try {
      const { program } = await readGrowthProfileWorkflow();
      return reply.header('Cache-Control', 'private, no-store').send(program);
    } catch (error) {
      app.log.error({ error }, 'Growth profile YAML failed validation');
      return reply.code(500).send({ error: 'Growth profile definition unavailable' });
    }
  });
  app.get('/growth/workflows/profile/yaml', async (_request, reply) => {
    try {
      const { yaml } = await readGrowthProfileWorkflow();
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/yaml; charset=utf-8')
        .send(yaml);
    } catch (error) {
      app.log.error({ error }, 'Growth profile YAML failed validation');
      return reply.code(500).send({ error: 'Growth profile definition unavailable' });
    }
  });
  // A six-stage Growth composition; existing Runner executes every browser step.
  app.get('/growth/workflows/profile/runs', async () => growthProfileRuns.list());
  app.get<{ Params: { id: string } }>('/growth/workflows/profile/runs/:id', async (request, reply) => {
    const run = await growthProfileRuns.get(request.params.id);
    return run ?? reply.code(404).send({ error: 'Growth run not found' });
  });
  app.post<{ Body: { accountId: string } }>(
    '/growth/workflows/profile/runs',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['accountId'],
          properties: {
            accountId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const account = await connectors.requireConnected(request.body.accountId, 'linkedin');
        return reply.code(202).send(await growthProfileRuns.start(account.id, account.profileUrl));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Growth run could not start';
        return reply.code(message.startsWith('BUSY:') ? 409 : 400).send({ error: message });
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: { sectionId: string; text: string };
  }>(
    '/growth/workflows/profile/runs/:id/evidence',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['sectionId', 'text'],
          properties: {
            sectionId: { type: 'string', pattern: '^[a-z][a-zA-Z0-9]*$' },
            text: { type: 'string', minLength: 10, maxLength: 1500 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const current = await growthProfileRuns.get(request.params.id);
        if (!current) return reply.code(404).send({ error: 'Growth run not found' });
        await connectors.requireConnected(current.accountId, 'linkedin', current.profileUrl);
        return await growthProfileRuns.supplyEvidence(request.params.id, request.body);
      } catch (error) {
        return reply.code(409).send({
          error: error instanceof Error ? error.message : 'Evidence rejected',
        });
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    '/growth/workflows/profile/runs/:id/advance',
    async (request, reply) => {
      try {
        const current = await growthProfileRuns.get(request.params.id);
        if (!current) return reply.code(404).send({ error: 'Growth run not found' });
        await connectors.requireConnected(current.accountId, 'linkedin', current.profileUrl);
        return await growthProfileRuns.advance(request.params.id);
      } catch (error) {
        return reply.code(409).send({
          error: error instanceof Error ? error.message : 'Cannot advance Growth workflow',
        });
      }
    },
  );

  // Owner-scoped Growth template CRUD. Stored templates supplement (never
  // replace) the read-only file-backed YAML catalogue.
  app.post<{ Body: StoredGrowthTemplate }>('/growth/templates', async (request, reply) => {
    try {
      const template = request.body;
      if (!template.id || !template.yaml || !template.program)
        return reply.code(400).send({ error: 'Template id, yaml and program are required' });
      const version = await growthTemplates.put(template, 0);
      return reply.code(201).send({ id: template.id, version });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template create failed';
      return reply.code(message.startsWith('Database document changed') ? 409 : 400).send({
        error: message,
      });
    }
  });

  app.put<{ Params: { id: string }; Body: StoredGrowthTemplate }>(
    '/growth/templates/:id',
    async (request, reply) => {
      try {
        const template = { ...request.body, id: request.params.id };
        const existing = await growthTemplates.get(request.params.id);
        if (!existing) return reply.code(404).send({ error: 'Growth template not found' });
        if (existing.ownerId !== ownerId)
          return reply.code(403).send({ error: 'Template not accessible to this owner' });
        const version = await growthTemplates.put(template, existing.version);
        return reply.send({ id: template.id, version });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Template update failed';
        return reply.code(message.startsWith('Database document changed') ? 409 : 400).send({
          error: message,
        });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/growth/templates/:id', async (request, reply) => {
    try {
      const existing = await growthTemplates.get(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'Growth template not found' });
      if (existing.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Template not accessible to this owner' });
      await growthTemplates.remove(request.params.id, existing.version);
      return reply.send({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template delete failed';
      return reply.code(400).send({ error: message });
    }
  });
}
