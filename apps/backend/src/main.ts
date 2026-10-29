import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { Runner } from './core/runner.js';
import { ConnectorService } from './core/connectors.js';
import { ActivityMemory } from './core/activity-memory.js';
import { CreatorResearchStore, researchYaml } from './core/linkedin-creator-research.js';
import { LinkedInEditorialStore, editorialYaml } from './core/linkedin-editorial.js';
import { LinkedInPublishingProvider, LinkedInProviderError } from './core/linkedin-publisher.js';
import { ProfilePlanner } from './core/profile-planner.js';
import { WorkflowPlanStore } from './core/workflow-store.js';
import {
  readGrowthProfileWorkflow,
  readGrowthTemplateCatalog,
  readGrowthTemplate,
} from './engine/growth-profile.js';
import { ProfileGrowthCoordinator } from './engine/profile-growth-coordinator.js';
import { WorkflowRegistry } from './core/workflow-registry.js';
import { StepDefinitionStore } from './core/step-definitions.js';
import { loadStepForms } from './core/step-forms.js';
import { createDocumentStore, type DocumentStore } from './db/documents.js';
import { compileWorkflow } from './core/workflow-yaml.js';
import type { WorkflowPlan } from './core/workflow-plan.js';
import type { Action } from './core/types.js';
import { profileUrlForHandle } from './core/validate.js';
import { CareerStore } from './profile/career-store.js';
import { AccountStore } from './profile/account-store.js';
import { loadAutomationPlaybook } from './profile/playbook.js';
import { assessAudit } from './core/assessment.js';
import { loadIdentityTimeline } from './profile/timeline.js';
import {
  VisualReviewStore,
  type VisualRegion,
  type VisualAnnotation,
  type AnnotationEditEvent,
} from './core/visual-review.js';
import type { Platform } from './core/types.js';
import type { RunRequest, StreamEvent } from './core/types.js';
import { CraftLibrary, parseMdx, toMdx, craftArchive, type CraftInput } from './crafts/library.js';

export function buildApp(options: { socialWorkspaceRoot?: string; linkedInFetch?: typeof fetch } = {}) {
  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    },
    bodyLimit: 32 * 1024,
  });
  const accountStore = new AccountStore(options.socialWorkspaceRoot);
  const connectors = new ConnectorService(accountStore, undefined, options.socialWorkspaceRoot);
  let database: DocumentStore | undefined;
  const activityMemory = new ActivityMemory();
  const linkedInResearch = new CreatorResearchStore(
    options.socialWorkspaceRoot
      ? resolve(options.socialWorkspaceRoot, '.runtime', 'linkedin-research')
      : undefined,
  );
  const linkedInEditorial = new LinkedInEditorialStore(
    accountStore,
    linkedInResearch,
    options.socialWorkspaceRoot
      ? resolve(options.socialWorkspaceRoot, '.runtime', 'linkedin-drafts')
      : undefined,
  );
  const runner = new Runner(
    async (id) => {
      await connectors.expire(id);
    },
    async (page, accountId, platform) => {
      if (platform !== 'linkedin') return;
      const account = await connectors.requireConnected(accountId, platform);
      const state = await connectors.verify(page, account);
      if (state === 'temporarily-unavailable')
        throw Error('LinkedIn is temporarily unavailable; the saved login was not cleared');
      if (state !== 'verified')
        throw Error('LinkedIn session not authenticated. Reconnect and verify this account.');
    },
  );
  const profilePlanner = new ProfilePlanner();
  const career = new CareerStore();
  const workflowPlans = new WorkflowPlanStore();
  const workflowRegistry = new WorkflowRegistry();
  const linkedInPublisher = new LinkedInPublishingProvider(
    accountStore,
    linkedInEditorial,
    process.env,
    options.linkedInFetch,
  );
  const authoredSteps = new StepDefinitionStore();
  const growthProfileRuns = new ProfileGrowthCoordinator(runner);
  const craftLibrary = new CraftLibrary();
  const visual = new VisualReviewStore((runId, fileName, platform) => {
    const run = runner.get(runId);
    return (
      run?.platform === platform &&
      runner.events
        .getSince(0, runId)
        .some(
          (event) =>
            event.kind === 'screenshot' &&
            (event.details as { fileName?: unknown } | undefined)?.fileName === fileName,
        )
    );
  });

  app.addHook('onReady', async () => {
    if (process.env.NODE_ENV === 'test' && process.env.UTOMATOR_TEST_DATABASE !== 'true') return;
    database = await createDocumentStore(process.env, process.env.UTOMATOR_INTERNAL_OWNER_ID);
    accountStore.setDocuments(database);
    career.setDocuments(database);
    connectors.setDocuments(database);
    workflowPlans.setDocuments(database);
    workflowRegistry.setDocuments(database);
    growthProfileRuns.setDocuments(database);
    linkedInResearch.setDocuments(database);
    linkedInEditorial.setDocuments(database);
    linkedInPublisher.setDocuments(database);
    craftLibrary.setDocuments(database);
    await craftLibrary.initialize();
  });
  app.addHook('onClose', async () => {
    await database?.close();
  });

  // A local UI is the only supported caller. Cross-site browser requests are rejected.
  app.addHook('onRequest', async (request, reply) => {
    const internalToken = process.env.UTOMATOR_INTERNAL_TOKEN;
    if (process.env.UTOMATOR_INTERNAL_OWNER_ID) {
      if (!internalToken)
        return reply.code(503).send({ error: 'Hosted worker authentication unavailable' });
      const provided = request.headers['x-utomator-worker-token'];
      const expected = Buffer.from(internalToken);
      const actual = typeof provided === 'string' ? Buffer.from(provided) : Buffer.alloc(0);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        return reply.code(401).send({ error: 'Worker authentication required' });
    }
    // Reject DNS-rebinding requests before serving local résumé content or
    // accepting a one-time password. The app must stay bound to loopback.
    const host = request.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
      return reply.code(403).send({ error: 'Local dashboard only' });
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin) {
      const url = new URL(origin);
      const listening = app.server.address();
      const port =
        listening && typeof listening !== 'string' ? listening.port : Number(process.env.PORT || 3101);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.port !== String(port) ||
        url.protocol !== 'http:'
      ) {
        return reply.code(403).send({ error: 'Only the local dashboard can submit actions' });
      }
    }
  });

  const runBodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['platform', 'action'],
    properties: {
      platform: { enum: ['linkedin', 'x'] },
      accountId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
      action: {
        enum: [
          'audit',
          'audit-page',
          'edit-profile',
          'add-skill',
          'compose-post',
          'pin-post',
          'delete-post',
          'edit-experience',
          'edit-website',
          'edit-services',
          'add-project',
          'add-featured',
          'upload-banner',
        ],
      },
      profileUrl: { type: 'string', maxLength: 250 },
      pageUrl: { type: 'string', maxLength: 400 },
      handle: { type: 'string', maxLength: 100 },
      login: {
        type: 'object',
        additionalProperties: false,
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string', minLength: 1, maxLength: 320 },
          password: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
      headline: { type: 'string', maxLength: 220 },
      about: { type: 'string', maxLength: 2600 },
      skill: { type: 'string', maxLength: 100 },
      bio: { type: 'string', maxLength: 160 },
      location: { type: 'string', maxLength: 100 },
      website: { type: 'string', maxLength: 250 },
      postText: { type: 'string', maxLength: 280 },
      postUrl: { type: 'string', maxLength: 300 },
      positionId: { type: 'string', maxLength: 20 },
      description: { type: 'string', maxLength: 3000 },
      startMonth: { type: 'string', maxLength: 12 },
      startYear: { type: 'string', maxLength: 4 },
      websiteIndex: { type: 'integer', minimum: 0, maximum: 9 },
      websiteType: { type: 'string', maxLength: 50 },
      projectName: { type: 'string', maxLength: 150 },
      projectUrl: { type: 'string', maxLength: 300 },
      featuredTitle: { type: 'string', maxLength: 160 },
      bannerPath: { type: 'string', maxLength: 500 },
      workflow: { type: 'object' },
      workflowId: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' },
      workflowRevision: { type: 'integer', minimum: 1 },
    },
  } as const;
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/connectors', async () => connectors.list());
  app.get('/connectors/capabilities', async () => connectors.capabilities());
  app.post<{
    Body: { platform: 'linkedin' | 'x' | 'instagram' | 'github' | 'devto' };
  }>('/connectors/start', async (request, reply) => {
    try {
      return await connectors.start(request.body?.platform);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Could not start connection',
      });
    }
  });
  app.post<{ Params: { id: string } }>('/connectors/:id/connect', async (request, reply) => {
    try {
      return await connectors.begin(request.params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      return reply
        .code(message.includes('not found') ? 404 : message.includes('API connector') ? 422 : 400)
        .send({ error: message });
    }
  });
  app.post<{ Params: { id: string } }>('/connectors/:id/sync', async (request, reply) => {
    // Explicit Sync may navigate to the owner's profile. Background /check must not.
    try {
      return await connectors.sync(request.params.id);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Could not sync connection',
      });
    }
  });
  app.post<{ Params: { id: string } }>('/connectors/:id/check', async (request, reply) => {
    try {
      return await connectors.check(request.params.id);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Could not check connection',
      });
    }
  });
  app.post<{ Params: { id: string } }>('/connectors/:id/disconnect', async (request, reply) => {
    try {
      return await connectors.disconnect(request.params.id);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Could not disconnect',
      });
    }
  });

  // OAuth authorization is distinct from browser-based LinkedIn profile verification.
  // Callback logging is disabled to avoid recording the single-use authorization code.
  app.post<{ Body: { accountId: string } }>('/linkedin/oauth/start', async (request, reply) => {
    try {
      return await linkedInPublisher.begin(request.body?.accountId);
    } catch (error) {
      const e = error as LinkedInProviderError;
      return reply.code(e.httpStatus || 400).send({ error: e.message });
    }
  });
  app.get<{ Querystring: { accountId: string } }>('/linkedin/oauth/status', async (request, reply) => {
    try {
      return await linkedInPublisher.status(request.query?.accountId);
    } catch (error) {
      const e = error as LinkedInProviderError;
      return reply.code(e.httpStatus || 400).send({ error: e.message });
    }
  });
  app.get<{ Querystring: { state: string; code: string; error?: string } }>(
    '/linkedin/oauth/callback',
    { logLevel: 'silent' },
    async (request, reply) => {
      if (request.query?.error)
        return reply.code(400).send({ error: 'LinkedIn authorization was declined' });
      try {
        await linkedInPublisher.callback(request.query?.state, request.query?.code);
        return reply
          .header('Cache-Control', 'no-store')
          .header('Content-Security-Policy', "default-src 'none'")
          .type('text/html; charset=utf-8')
          .send(
            '<!doctype html><title>LinkedIn authorized</title><p>LinkedIn publishing authorization saved.</p><p><a href="/dashboard/editorial">Return to Utomator editorial</a></p>',
          );
      } catch (error) {
        const e = error as LinkedInProviderError;
        return reply.code(e.httpStatus || 400).send({ error: e.message });
      }
    },
  );
  app.post<{ Body: { accountId: string } }>('/linkedin/oauth/disconnect', async (request, reply) => {
    try {
      return await linkedInPublisher.disconnect(request.body?.accountId);
    } catch (error) {
      const e = error as LinkedInProviderError;
      return reply.code(e.httpStatus || 400).send({ error: e.message });
    }
  });
  app.post<{
    Params: { id: string };
    Body: { expectedVersion: number; confirmed: boolean };
  }>('/linkedin/drafts/:id/publish', async (request, reply) => {
    try {
      return await linkedInPublisher.publish(
        request.params.id,
        request.body?.expectedVersion,
        request.body?.confirmed,
      );
    } catch (error) {
      const e = error as LinkedInProviderError;
      return reply.code(e.httpStatus || 400).send({ error: e.message });
    }
  });

  // Internal LinkedIn editorial CRUD. Does not publish content or invoke social-site mutations.
  app.get<{ Querystring: { accountId?: string } }>('/linkedin/drafts', async (request, reply) => {
    try {
      return await linkedInEditorial.list(request.query.accountId);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid draft query',
      });
    }
  });
  app.post<{ Body: { accountId: string; content: unknown } }>(
    '/linkedin/drafts',
    { bodyLimit: 32 * 1024 },
    async (request, reply) => {
      try {
        return reply
          .code(201)
          .send(await linkedInEditorial.create(request.body?.accountId, request.body?.content));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Unable to create draft',
        });
      }
    },
  );
  app.get<{ Params: { id: string } }>('/linkedin/drafts/:id', async (request, reply) => {
    try {
      return (
        (await linkedInEditorial.get(request.params.id)) ||
        reply.code(404).send({ error: 'Draft not found' })
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid draft ID',
      });
    }
  });
  app.put<{
    Params: { id: string };
    Body: { expectedVersion: number; content: unknown };
  }>('/linkedin/drafts/:id', { bodyLimit: 32 * 1024 }, async (request, reply) => {
    try {
      return await linkedInEditorial.update(
        request.params.id,
        request.body?.expectedVersion,
        request.body?.content,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update draft';
      return reply
        .code(message.includes('version conflict') ? 409 : message.includes('not found') ? 404 : 400)
        .send({ error: message });
    }
  });
  app.post<{
    Params: { id: string };
    Body: {
      expectedVersion: number;
      action: 'approve' | 'reopen' | 'archive' | 'delete' | 'restore';
      confirm?: boolean;
    };
  }>('/linkedin/drafts/:id/transition', async (request, reply) => {
    try {
      return await linkedInEditorial.transition(
        request.params.id,
        request.body?.expectedVersion,
        request.body?.action,
        request.body?.confirm,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change draft state';
      return reply
        .code(message.includes('version conflict') ? 409 : message.includes('not found') ? 404 : 400)
        .send({ error: message });
    }
  });
  app.get<{ Params: { id: string } }>('/linkedin/drafts/:id/yaml', async (request, reply) => {
    try {
      const draft = await linkedInEditorial.get(request.params.id);
      if (!draft) return reply.code(404).send({ error: 'Draft not found' });
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/yaml; charset=utf-8')
        .send(editorialYaml(draft));
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid draft ID',
      });
    }
  });

  // Read-only research using owner-supplied excerpts. No LinkedIn scraping, DMs or API mutation.
  app.get('/linkedin/research', async () => linkedInResearch.list());
  app.post<{ Body: unknown }>(
    '/linkedin/research',
    { bodyLimit: 128 * 1024 },
    async (request, reply) => {
      try {
        return reply.code(201).send(await linkedInResearch.create(request.body));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid LinkedIn research input',
        });
      }
    },
  );
  app.get<{ Params: { id: string } }>('/linkedin/research/:id', async (request, reply) => {
    try {
      return (
        (await linkedInResearch.get(request.params.id)) ||
        reply.code(404).send({ error: 'Research run not found' })
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid research run',
      });
    }
  });
  app.get<{ Params: { id: string } }>('/linkedin/research/:id/yaml', async (request, reply) => {
    try {
      const run = await linkedInResearch.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Research run not found' });
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/yaml; charset=utf-8')
        .send(researchYaml(run));
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid research run',
      });
    }
  });

  app.get('/intelligence', async () => activityMemory.list());
  app.post<{ Body: { text: string; platform?: Platform; accountId?: string } }>(
    '/intelligence/chat',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 2, maxLength: 2000 },
            platform: { enum: ['linkedin', 'x'] },
            accountId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send(await activityMemory.addChat(request.body));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid chat memory',
        });
      }
    },
  );

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

  // Crafts are MDX-backed database documents. Defaults are immutable and
  // personal variations are isolated by the authenticated database owner.
  const craftError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Craft operation failed';
    const status = /read-only/.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /Version conflict|changed\. Reload|slug already exists/i.test(message)
          ? 409
          : /database is unavailable/i.test(message)
            ? 503
            : 400;
    return { status, message };
  };
  app.get('/crafts', async () => craftLibrary.list());
  app.get<{ Params: { id: string } }>('/crafts/:id', async (request, reply) => {
    const craft = await craftLibrary.get(request.params.id);
    return craft || reply.code(404).send({ error: 'Craft not found' });
  });
  app.get<{ Params: { id: string } }>('/crafts/:id/mdx', async (request, reply) => {
    const craft = await craftLibrary.get(request.params.id);
    if (!craft) return reply.code(404).send({ error: 'Craft not found' });
    return reply.type('text/plain; charset=utf-8').send(toMdx(craft));
  });
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/crafts/:id/export',
    async (request, reply) => {
      const craft = await craftLibrary.get(request.params.id);
      if (!craft) return reply.code(404).send({ error: 'Craft not found' });
      const extension =
        request.query.format === 'zip'
          ? 'zip'
          : request.query.format === 'skill' || !request.query.format
            ? 'skill'
            : null;
      if (!extension) return reply.code(400).send({ error: 'Format must be skill or zip' });
      return reply
        .header('Content-Disposition', 'attachment; filename="' + craft.slug + '.' + extension + '"')
        .header('Cache-Control', 'private, no-store')
        .type('application/zip')
        .send(craftArchive(craft));
    },
  );
  app.post<{ Body: CraftInput }>('/crafts', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    try {
      return reply.code(201).send(await craftLibrary.create(request.body));
    } catch (error) {
      const issue = craftError(error);
      return reply.code(issue.status).send({ error: issue.message });
    }
  });
  app.post<{ Body: { mdx: string } }>(
    '/crafts/from-mdx',
    { bodyLimit: 128 * 1024 },
    async (request, reply) => {
      try {
        return reply.code(201).send(await craftLibrary.create(parseMdx(request.body?.mdx)));
      } catch (error) {
        const issue = craftError(error);
        return reply.code(issue.status).send({ error: issue.message });
      }
    },
  );
  app.post<{ Params: { id: string } }>('/crafts/:id/clone', async (request, reply) => {
    try {
      return reply.code(201).send(await craftLibrary.clone(request.params.id));
    } catch (error) {
      const issue = craftError(error);
      return reply.code(issue.status).send({ error: issue.message });
    }
  });
  app.put<{
    Params: { id: string };
    Body: { expectedVersion: number; craft?: CraftInput; mdx?: string };
  }>('/crafts/:id', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    try {
      const original = await craftLibrary.get(request.params.id);
      if (!original) return reply.code(404).send({ error: 'Craft not found' });
      const { expectedVersion, craft, mdx } = request.body || {};
      if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1 ||
        (typeof mdx === 'string') === Boolean(craft)
      )
        return reply.code(400).send({
          error: 'Expected version and exactly one MDX or graph payload',
        });
      const input = typeof mdx === 'string' ? parseMdx(mdx, original) : craft!;
      return await craftLibrary.update(request.params.id, input, expectedVersion);
    } catch (error) {
      const issue = craftError(error);
      return reply.code(issue.status).send({ error: issue.message });
    }
  });
  app.delete<{ Params: { id: string }; Body: { expectedVersion: number } }>(
    '/crafts/:id',
    async (request, reply) => {
      try {
        const version = request.body?.expectedVersion;
        if (!Number.isInteger(version) || version < 1)
          return reply.code(400).send({ error: 'Expected version required' });
        return await craftLibrary.remove(request.params.id, version);
      } catch (error) {
        const issue = craftError(error);
        return reply.code(issue.status).send({ error: issue.message });
      }
    },
  );

  // Visual reviews store only bounded image bytes and explicit operator
  // annotations; image pixels are never translated into unapproved clicks.
  app.get('/visual-reviews', async () => visual.listReviews());
  app.get<{ Params: { id: string } }>('/visual-reviews/:id/image', async (request, reply) => {
    const result = await visual.imageFor(request.params.id);
    if (!result) return reply.code(404).send({ error: 'Image not found' });
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(result.mime)
      .send(result.bytes);
  });
  app.get<{ Params: { id: string } }>('/visual-reviews/:id/yaml', async (request, reply) => {
    const yaml = await visual.yamlFor(request.params.id);
    if (!yaml) return reply.code(404).send({ error: 'Annotation YAML not found' });
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type('text/yaml; charset=utf-8')
      .send(yaml);
  });
  app.post<{
    Body: {
      platform: Platform;
      handle: string;
      pageUrl: string;
      nodeId: string;
      note: string;
      regions?: VisualRegion[];
      annotations?: VisualAnnotation[];
      editEvents?: AnnotationEditEvent[];
      source:
        | { kind: 'capture'; runId: string; fileName: string }
        | { kind: 'upload'; imageData: string }
        | { kind: 'review'; reviewId: string };
    };
  }>('/visual-reviews', { bodyLimit: 3 * 1024 * 1024 }, async (request, reply) => {
    try {
      const entry = await visual.addReview(request.body);
      return reply.code(201).send(entry);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid visual review',
      });
    }
  });
  app.get('/identity-memory', async () => visual.listNotes());
  app.get('/identity-timeline', async () => loadIdentityTimeline());
  app.post<{
    Body: { platform: Platform; handle: string; pageUrl: string; text: string };
  }>(
    '/identity-memory',
    {
      schema: {
        body: {
          type: 'object',
          required: ['platform', 'handle', 'pageUrl', 'text'],
          additionalProperties: false,
          properties: {
            platform: { enum: ['linkedin', 'x'] },
            handle: { type: 'string', minLength: 1, maxLength: 100 },
            pageUrl: { type: 'string', minLength: 10, maxLength: 400 },
            text: { type: 'string', minLength: 3, maxLength: 800 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send(await visual.addNote(request.body));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid memory note',
        });
      }
    },
  );

  // Read-only full-profile optimization planning. Independent from social-site mutation.
  app.post<{ Body: { accountId: string } }>(
    '/profile-plans',
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
        const selected = await connectors.requireConnected(request.body.accountId, 'linkedin');
        const saved = await career.get();
        return reply.code(201).send(
          await profilePlanner.start({
            accountId: selected.id,
            profileUrl: selected.profileUrl,
            career: saved.profile,
            careerRevision: saved.revision,
          }),
        );
      } catch (error) {
        return reply.code(422).send({
          error: error instanceof Error ? error.message : 'Could not assess account career evidence',
        });
      }
    },
  );
  app.get<{ Params: { id: string } }>('/profile-plans/:id', async (request, reply) => {
    try {
      return (
        (await profilePlanner.get(request.params.id)) ||
        reply.code(404).send({ error: 'Optimization run not found' })
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid run ID',
      });
    }
  });
  app.post<{ Params: { id: string }; Body: { approved: boolean } }>(
    '/profile-plans/:id/decision',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['approved'],
          properties: { approved: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      try {
        return await profilePlanner.decide(request.params.id, request.body.approved);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to approve';
        return reply.code(message.includes('not found') ? 404 : 409).send({ error: message });
      }
    },
  );
  app.post<{ Params: { id: string }; Body: { selectedIds: string[] } }>(
    '/profile-plans/:id/select',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['selectedIds'],
          properties: {
            selectedIds: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              uniqueItems: true,
              items: {
                type: 'string',
                pattern: '^(headline|about|experience|featured)$',
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await profilePlanner.select(request.params.id, request.body.selectedIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to finalize plan';
        return reply.code(message.includes('not found') ? 404 : 409).send({ error: message });
      }
    },
  );
  // Local owner identity and saved social references, separate from career history.
  app.get('/account', async () => accountStore.get());
  app.put<{ Body: { expectedRevision: number; document: unknown } }>(
    '/account/profile',
    { bodyLimit: 32768 },
    async (request, reply) => {
      try {
        return await accountStore.updateProfile(request.body?.expectedRevision, request.body?.document);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid account';
        return reply.code(message.includes('changed') ? 409 : 400).send({ error: message });
      }
    },
  );
  // Public callers cannot create or change a social identity by supplying a handle.
  // The connector writes the verified profile only after provider-side ownership proof.
  app.post('/account/social', async (_request, reply) =>
    reply.code(405).send({ error: 'Link social accounts through a verified connector' }),
  );
  app.put('/account/social/:id', async (_request, reply) =>
    reply.code(405).send({ error: 'Linked social identities cannot be edited manually' }),
  );
  app.delete<{ Params: { id: string }; Body: { expectedRevision: number } }>(
    '/account/social/:id',
    async (request, reply) => {
      try {
        // An account reference is also the owner key for its browser profile
        // and LinkedIn API grant. Never leave credentials orphaned after removal.
        const snapshot = await accountStore.get();
        if (snapshot.revision !== request.body?.expectedRevision) throw Error('Account changed');
        const existing = snapshot.socialAccounts.find((item) => item.id === request.params.id);
        if (!existing) throw Error('Social account not found');
        await connectors.disconnect(existing.id);
        if (existing.platform === 'linkedin' && database)
          await linkedInPublisher.disconnect(existing.id);
        return await accountStore.removeSocial(request.body.expectedRevision, existing.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid social profile';
        return reply
          .code(message.includes('changed') ? 409 : message.includes('not found') ? 404 : 400)
          .send({ error: message });
      }
    },
  );
  // Owner-only, loopback career workspace. Role-specific drafts are never published.
  app.get('/career', async () => career.get());
  app.put<{ Body: { expectedRevision: number; document: unknown } }>(
    '/career/profile',
    { bodyLimit: 128 * 1024 },
    async (request, reply) => {
      try {
        return await career.updateProfile(request.body?.expectedRevision, request.body?.document);
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Invalid career profile';
        return reply.code(error.includes('changed') ? 409 : 400).send({ error });
      }
    },
  );
  app.post<{ Body: { expectedRevision: number; fromId?: string } }>(
    '/career/resumes',
    async (request, reply) => {
      try {
        return reply
          .code(201)
          .send(await career.createResume(request.body?.expectedRevision, request.body?.fromId));
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Invalid résumé';
        return reply
          .code(error.includes('changed') ? 409 : error.includes('not found') ? 404 : 400)
          .send({ error });
      }
    },
  );
  app.put<{
    Params: { id: string };
    Body: { expectedRevision: number; document: unknown };
  }>('/career/resumes/:id', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    try {
      return await career.updateResume(
        request.body?.expectedRevision,
        request.params.id,
        request.body?.document,
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Invalid résumé';
      return reply
        .code(error.includes('changed') ? 409 : error.includes('not found') ? 404 : 400)
        .send({ error });
    }
  });
  app.delete<{ Params: { id: string }; Body: { expectedRevision: number } }>(
    '/career/resumes/:id',
    async (request, reply) => {
      try {
        return await career.deleteResume(request.body?.expectedRevision, request.params.id);
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Invalid résumé';
        return reply
          .code(error.includes('changed') ? 409 : error.includes('not found') ? 404 : 400)
          .send({ error });
      }
    },
  );
  app.get('/owner-context', async () => accountStore.get());
  app.get('/playbook', async () => loadAutomationPlaybook());

  // Data-driven Growth template discovery. No dedicated page or controller per Growth.
  app.get('/growth/templates', async (_request, reply) => {
    try {
      const catalog = await readGrowthTemplateCatalog();
      return reply.header('Cache-Control', 'private, no-store').send(
        catalog.map(({ program }) => ({
          id: program.id,
          title: program.title,
          objective: program.objective,
          platform: 'linkedin',
          pipelineCount: program.stages.length,
          coverageCount: program.coverage.length,
          executable: true,
        })),
      );
    } catch (error) {
      app.log.error({ error }, 'Growth YAML template catalogue failed validation');
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

  app.get('/runs', async () => runner.list());
  app.get<{ Params: { id: string; file: string } }>(
    '/runs/:id/evidence/:file',
    async (request, reply) => {
      const { id, file } = request.params;
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-zA-Z0-9_-]+\.png$/.test(file)) {
        return reply.code(404).send({ error: 'Evidence not found' });
      }
      if (!runner.get(id)) return reply.code(404).send({ error: 'Evidence not found' });
      let captured = runner.events.getSince(0, id).some((event) => {
        const details = event.details as { fileName?: unknown } | undefined;
        return event.kind === 'screenshot' && details?.fileName === file;
      });
      if (!captured) {
        // Restored history has no in-memory EventJournal; authorize from the
        // persisted run-specific journal rather than exposing arbitrary files.
        try {
          const rows = (await readFile(resolve('.runtime', 'runs', id + '.jsonl'), 'utf8')).split('\n');
          captured = rows.some((row) => {
            if (!row) return false;
            try {
              const entry = JSON.parse(row) as {
                kind?: string;
                details?: { fileName?: string };
              };
              return entry.kind === 'screenshot' && entry.details?.fileName === file;
            } catch {
              return false;
            }
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (!captured) return reply.code(404).send({ error: 'Evidence not found' });
      try {
        const png = await readFile(resolve('.runtime', 'evidence', id, file));
        return reply
          .header('Cache-Control', 'private, no-store')
          .header('X-Content-Type-Options', 'nosniff')
          .type('image/png')
          .send(png);
      } catch (error) {
        const missing = error as NodeJS.ErrnoException;
        if (missing.code === 'ENOENT') return reply.code(404).send({ error: 'Evidence not found' });
        throw error;
      }
    },
  );

  app.get<{ Params: { id: string } }>('/runs/:id/assessment', async (request, reply) => {
    const run = runner.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (run.action !== 'audit')
      return reply.code(409).send({ error: 'Assessment requires an audit run' });
    if (runner.events.getSince(0, run.id).length === 0)
      return reply.code(409).send({
        error: 'Live assessment events are unavailable after restart; review the archived run journal',
      });
    // A static portfolio headline is not evidence of the selected account.
    return assessAudit(runner.events, run, null);
  });
  app.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const run = runner.get(request.params.id);
    return run ?? reply.code(404).send({ error: 'Run not found' });
  });
  app.get<{ Params: { id: string } }>('/runs/:id/workflow.yaml', async (request, reply) => {
    const yaml = runner.workflowYaml(request.params.id);
    if (!yaml) return reply.code(404).send({ error: 'Run YAML snapshot not found' });
    return reply
      .header('Cache-Control', 'private, no-store')
      .type('text/yaml; charset=utf-8')
      .send(yaml);
  });
  app.get<{ Params: { id: string; stepId: string } }>(
    '/runs/:id/steps/:stepId.yaml',
    async (request, reply) => {
      const yaml = runner.workflowYaml(request.params.id, request.params.stepId);
      if (!yaml) return reply.code(404).send({ error: 'Run step YAML not found' });
      return reply
        .header('Cache-Control', 'private, no-store')
        .type('text/yaml; charset=utf-8')
        .send(yaml);
    },
  );
  app.get<{ Params: { id: string; stepId: string } }>(
    '/runs/:id/steps/:stepId/output',
    async (request, reply) => {
      const result = runner.stepOutput(request.params.id, request.params.stepId);
      return result
        ? reply.header('Cache-Control', 'private, no-store').send(result)
        : reply.code(404).send({ error: 'Step output not found or not yet completed' });
    },
  );
  app.get<{ Params: { id: string } }>('/runs/:id/logs', async (request, reply) => {
    if (!runner.get(request.params.id)) return reply.code(404).send({ error: 'Run not found' });
    try {
      const log = await readFile(resolve('.runtime', 'runs', request.params.id + '.jsonl'), 'utf8');
      return reply.header('Cache-Control', 'private, no-store').send(
        log
          .split('\n')
          .filter(Boolean)
          .slice(-1000)
          .map((row) => JSON.parse(row) as StreamEvent),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return reply.code(404).send({ error: 'Journal unavailable' });
      throw error;
    }
  });
  app.post<{ Body: RunRequest & { handle?: string } }>(
    '/runs',
    { schema: { body: runBodySchema } },
    async (request, reply) => {
      try {
        const { handle, profileUrl, ...rest } = request.body;
        // Saved or explicitly supplied LinkedIn artboard graphs must bind to a verified account.
        // Preserve the legacy standalone handle-audit login path without bypassing template checks.
        if (
          rest.platform === 'linkedin' &&
          (rest.workflowId !== undefined || rest.workflow !== undefined) &&
          !rest.accountId
        ) {
          return reply.code(400).send({
            error: 'Select, connect, and sync a LinkedIn account before running this workflow',
          });
        }
        if (!rest.accountId && Boolean(handle) === Boolean(profileUrl)) {
          return reply.code(400).send({ error: 'Supply either your handle or a profile URL' });
        }
        const resolved = rest.accountId
          ? (
              await connectors.requireConnected(
                rest.accountId,
                rest.platform,
                profileUrl || (handle ? profileUrlForHandle(rest.platform, handle) : undefined),
              )
            ).profileUrl
          : handle
            ? profileUrlForHandle(rest.platform, handle)
            : profileUrl;
        if (rest.workflowId !== undefined) {
          if (
            rest.workflow !== undefined ||
            !Number.isSafeInteger(rest.workflowRevision) ||
            (rest.workflowRevision ?? 0) < 1
          ) {
            return reply.code(400).send({
              error: 'Choose a saved workflow revision instead of submitting a second graph',
            });
          }
          const record = await workflowRegistry.get(rest.workflowId, rest.workflowRevision);
          if (!record) return reply.code(404).send({ error: 'Workflow revision not found' });
          if (record.plan.platform !== rest.platform || record.plan.action !== rest.action)
            return reply.code(400).send({
              error: 'Workflow identity does not match the requested action',
            });
          // A revision cannot be represented as one graph and executed with different action inputs.
          // Authentication, selected account and page scope remain explicit per-run inputs.
          const parameterKeys = [
            'headline',
            'about',
            'skill',
            'bio',
            'location',
            'website',
            'postText',
            'postUrl',
            'positionId',
            'description',
            'startMonth',
            'startYear',
            'websiteIndex',
            'websiteType',
            'projectName',
            'projectUrl',
            'featuredTitle',
            'bannerPath',
          ] as const;
          const snapshot = record.plan.parameters ?? {};
          const resolvedFields: Record<string, string | number> = {};
          for (const key of parameterKeys) {
            const saved = snapshot[key],
              supplied = rest[key];
            if (supplied !== undefined && (saved === undefined || String(supplied) !== saved))
              return reply.code(409).send({
                error: 'Action inputs differ from the selected workflow revision',
              });
            if (saved !== undefined)
              resolvedFields[key] = key === 'websiteIndex' ? Number(saved) : saved;
          }
          const definitions = await authoredSteps.resolve(record.plan);
          return reply.code(202).send(
            runner.start(
              {
                ...rest,
                ...resolvedFields,
                profileUrl: resolved,
                workflow: record.plan,
                workflowId: record.id,
                workflowRevision: record.revision,
              },
              definitions,
            ),
          );
        }
        if (rest.workflowRevision !== undefined)
          return reply.code(400).send({ error: 'Workflow ID required for revisioned execution' });
        const definitions = rest.workflow ? await authoredSteps.resolve(rest.workflow) : undefined;
        return reply.code(202).send(runner.start({ ...rest, profileUrl: resolved }, definitions));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(message.startsWith('BUSY:') ? 409 : 400).send({ error: message });
      }
    },
  );
  app.post<{
    Params: { id: string };
    Body: { checkpointId: string; approved: boolean };
  }>(
    '/runs/:id/decision',
    {
      schema: {
        body: {
          type: 'object',
          required: ['checkpointId', 'approved'],
          additionalProperties: false,
          properties: {
            checkpointId: { type: 'string', pattern: '^[a-f0-9-]{36}$' },
            approved: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const ok = runner.decide(request.params.id, request.body.checkpointId, request.body.approved);
      return ok ? { accepted: true } : reply.code(409).send({ error: 'No matching pending checkpoint' });
    },
  );
  app.post<{
    Params: { id: string };
    Body: { checkpointId: string; value: string };
  }>(
    '/runs/:id/input',
    {
      schema: {
        body: {
          type: 'object',
          required: ['checkpointId', 'value'],
          additionalProperties: false,
          properties: {
            checkpointId: { type: 'string', pattern: '^[a-f0-9-]{36}$' },
            value: { type: 'string', minLength: 1, maxLength: 300 },
          },
        },
      },
    },
    async (request, reply) => {
      const accepted = runner.answerText(
        request.params.id,
        request.body.checkpointId,
        request.body.value,
      );
      return accepted
        ? { accepted: true }
        : reply.code(409).send({ error: 'No matching pending input' });
    },
  );
  app.post<{ Params: { id: string } }>('/runs/:id/pause', async (request, reply) => {
    return runner.pause(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run is not at a pausable state' });
  });
  app.post<{ Params: { id: string } }>('/runs/:id/resume', async (request, reply) => {
    return runner.resume(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run is not paused' });
  });
  app.post<{ Params: { id: string } }>('/runs/:id/cancel', async (request, reply) => {
    return runner.cancel(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run not active' });
  });

  app.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const runId = request.params.id;
    if (!runner.get(runId)) return reply.code(404).send({ error: 'Run not found' });
    if (runner.events.getSince(0, runId).length === 0)
      return reply.code(409).send({
        error: 'Archived run events are available through the persisted logs endpoint',
      });
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    reply.raw.flushHeaders();
    const send = (event: StreamEvent) => {
      if (event.runId === runId && !reply.raw.destroyed) {
        reply.raw.write(`id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    };
    const cursor = Number(
      request.headers['last-event-id'] ||
        (request.query && (request.query as { since?: string }).since) ||
        0,
    );
    for (const event of runner.events.getSince(Number.isFinite(cursor) ? cursor : 0, runId)) send(event);
    const unsubscribe = runner.events.subscribe(send);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 15000);
    reply.raw.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });
  return app;
}
