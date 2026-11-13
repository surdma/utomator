import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import { AuthBlockedError } from './domain/errors.js';
import { isOwnedBy } from './domain/ownership.js';
import { ConnectorService } from './infrastructure/connect/service.js';
import { CraftLibrary } from './infrastructure/crafts/library.js';
import {
  checkedOwnerId,
  createDocumentStore,
  type DocumentStore,
  LOCAL_OWNER_ID,
} from './infrastructure/db/documents.js';
import { GrowthTemplateStore } from './infrastructure/growth/growth-template-store.js';
import { ProfileGrowthCoordinator } from './infrastructure/growth/profile-growth-coordinator.js';
import { CreatorResearchStore } from './infrastructure/linkedin/linkedin-creator-research.js';
import { LinkedInEditorialStore } from './infrastructure/linkedin/linkedin-editorial.js';
import { LinkedInPublishingProvider } from './infrastructure/linkedin/linkedin-publisher.js';
import { workflowRegistryPort } from './infrastructure/mator/mator-actions.js';
import { ActivityMemory } from './infrastructure/mator/mator-activity-memory.js';
import { AccountStore } from './infrastructure/profile/account-store.js';
import { CareerStore } from './infrastructure/profile/career-store.js';
import { ProfilePlanner } from './infrastructure/profile/profile-planner.js';
import { loadIdentityTimeline } from './infrastructure/profile/profile-timeline.js';
import { prepareRun } from './infrastructure/runs/prepare-run.js';
import { Runner } from './infrastructure/runs/runner.js';
import { VisualReviewStore } from './infrastructure/runs/visual-review.js';
import { StepDefinitionStore } from './infrastructure/workflows/step-definitions.js';
import { WorkflowRegistry } from './infrastructure/workflows/workflow-registry.js';
import { WorkflowPlanStore } from './infrastructure/workflows/workflow-store.js';
import { registerConnectorRoutes } from './interface/http/connect.js';
import { registerCraftRoutes } from './interface/http/crafts.js';
import { registerEditorialRoutes } from './interface/http/editorial.js';
import { registerGrowthRoutes } from './interface/http/growth.js';
import { registerIntelligenceRoutes } from './interface/http/intelligence.js';
import { registerMatorRoutes } from './interface/http/mator-routes.js';
import { registerProfilePlanRoutes } from './interface/http/planning.js';
import { registerProfileRoutes } from './interface/http/profile.js';
import { registerReviewRoutes } from './interface/http/reviews.js';
import { registerRunRoutes } from './interface/http/runs.js';
import { registerWorkflowRoutes } from './interface/http/workflows.js';

/**
 * HTTP composition root.
 *
 * All service construction and lifecycle wiring stays here so a restart keeps
 * the exact same wiring order; route registration lives in `src/interface/http`, one
 * register function per domain, each receiving its already-built deps.
 * The frontend proxy allowlist depends on the route strings unchanged.
 */
export function buildApp(options: { socialWorkspaceRoot?: string; linkedInFetch?: typeof fetch } = {}) {
  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    },
    bodyLimit: 32 * 1024,
  });
  // Trusted server-side owner principal. Derived from the deployment
  // environment, never from a client-controlled header. Single-tenant local
  // deployments default to LOCAL_OWNER_ID ('local-owner'); hosted workers use
  // UTOMATOR_INTERNAL_OWNER_ID.
  const ownerId = checkedOwnerId(process.env.UTOMATOR_INTERNAL_OWNER_ID ?? LOCAL_OWNER_ID);
  const accountStore = new AccountStore(options.socialWorkspaceRoot);
  const connectors = new ConnectorService(accountStore, undefined, options.socialWorkspaceRoot);
  let database: DocumentStore | undefined;
  const activityMemory = new ActivityMemory(undefined, ownerId);
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
        throw new AuthBlockedError(
          'LinkedIn session not authenticated. Reconnect and verify this account.',
        );
    },
  );
  const profilePlanner = new ProfilePlanner(undefined, () => loadIdentityTimeline(ownerId), ownerId);
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
  const growthProfileRuns = new ProfileGrowthCoordinator(runner, ownerId);
  const growthTemplates = new GrowthTemplateStore(undefined, ownerId);
  const craftLibrary = new CraftLibrary();
  const visual = new VisualReviewStore(async (runId, fileName, platform) => {
    const run = runner.get(runId);
    if (!run || !isOwnedBy(run, ownerId) || run.platform !== platform) return false;
    return runner.isScreenshotAuthorized(runId, fileName);
  }, ownerId);

  app.addHook('onReady', async () => {
    if (process.env.NODE_ENV === 'test' && process.env.UTOMATOR_TEST_DATABASE !== 'true') return;
    database = await createDocumentStore(process.env, process.env.UTOMATOR_INTERNAL_OWNER_ID);
    accountStore.setDocuments(database);
    career.setDocuments(database);
    connectors.setDocuments(database);
    workflowPlans.setDocuments(database);
    workflowRegistry.setDocuments(database);
    growthProfileRuns.setDocuments(database);
    growthTemplates.setDocuments(database);
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

  app.get('/health', async () => ({ status: 'ok' }));

  // Mator action chat: settings, conversations, agent turns, stage/restore, attachments, SSE.
  const matorPorts = {
    get workflows() {
      return workflowRegistryPort(workflowRegistry, database);
    },
    runner: {
      start: async (request: Parameters<typeof runner.start>[0]) => {
        const prepared = await prepareRun(request, ownerId, {
          connectors,
          workflowRegistry,
          authoredSteps,
        });
        return runner.start(prepared.request, prepared.definitions);
      },
    },
    crafts: {
      apply: async (action: { craftId?: string }) => {
        if (action.craftId) return craftLibrary.get(action.craftId);
        return craftLibrary.list();
      },
    },
  };
  registerMatorRoutes(app, {
    getDocuments: () => database,
    ports: matorPorts,
    resolveVisualReview: async (reviewId) => (await visual.yamlFor(reviewId)) !== null,
  });

  registerConnectorRoutes(app, connectors);
  registerEditorialRoutes(app, linkedInPublisher, linkedInEditorial, linkedInResearch);
  registerIntelligenceRoutes(app, activityMemory);
  registerWorkflowRoutes(app, workflowPlans, workflowRegistry, authoredSteps);
  registerCraftRoutes(app, craftLibrary);
  registerReviewRoutes(app, visual, ownerId);
  registerProfileRoutes(app, {
    accountStore,
    career,
    connectors,
    linkedInPublisher,
    database: () => database,
  });
  registerProfilePlanRoutes(app, { profilePlanner, connectors, career });
  registerGrowthRoutes(app, growthProfileRuns, connectors, growthTemplates, ownerId);
  registerRunRoutes(app, runner, { connectors, workflowRegistry, authoredSteps }, ownerId);

  return app;
}
