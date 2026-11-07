import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { ConnectorService } from '../connect/service.js';
import { runtimePath } from '../core/paths.js';
import type { RunRequest, RunSummary, StreamEvent } from '../core/types.js';
import { profileUrlForHandle } from '../core/validate.js';
import { assessAudit } from '../runs/assessment.js';
import { parseRunJournal } from '../runs/run-journal.js';
import type { Runner } from '../runs/runner.js';
import type { StepDefinitionStore } from '../workflows/step-definitions.js';
import type { WorkflowRegistry } from '../workflows/workflow-registry.js';

/**
 * Access rule for owner-bound runs.
 *
 * New runs are stamped with the trusted server-side principal. Legacy runs
 * that were recorded before ownership existed (ownerId === undefined) are
 * deliberately bound to the deployment's trusted principal so they remain
 * readable after this control is enabled. A run owned by another principal is
 * never accessible.
 */
export function runIsAccessibleToOwner(run: RunSummary, ownerId: string): boolean {
  return run.ownerId === undefined || run.ownerId === ownerId;
}

/** Run execution schema: platform/action scoped with bounded freeform inputs. */
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

/** Run lifecycle routes plus the per-run SSE event stream. */
export function registerRunRoutes(
  app: FastifyInstance,
  runner: Runner,
  stores: {
    connectors: ConnectorService;
    workflowRegistry: WorkflowRegistry;
    authoredSteps: StepDefinitionStore;
  },
  /** Trusted server-side owner principal. Derived from the deployment
   * environment (`UTOMATOR_INTERNAL_OWNER_ID`, default `local-owner`), never
   * from a client-controlled header. */
  ownerId: string,
) {
  const { connectors, workflowRegistry, authoredSteps } = stores;
  app.get<{ Querystring: { conversationId?: string } }>('/runs', async (request) => {
    // Only runs attributable to the trusted principal are listed. Legacy
    // ownerless runs (no ownerId stamped) are bound to the trusted principal
    // for read access; runs owned by another principal are never disclosed.
    let runs = runner.list().filter((run) => runIsAccessibleToOwner(run, ownerId));
    if (request.query.conversationId)
      runs = runs.filter((run) => run.conversationId === request.query.conversationId);
    return runs;
  });
  app.get<{ Params: { id: string; file: string } }>(
    '/runs/:id/evidence/:file',
    async (request, reply) => {
      const { id, file } = request.params;
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-zA-Z0-9_-]+\.png$/.test(file)) {
        return reply.code(404).send({ error: 'Evidence not found' });
      }
      const run = runner.get(id);
      if (!run) return reply.code(404).send({ error: 'Evidence not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
      const captured = await runner.isScreenshotAuthorized(id, file);
      if (!captured) return reply.code(404).send({ error: 'Evidence not found' });
      try {
        const png = await readFile(runtimePath('evidence', id, file));
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
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
    return run;
  });
  app.get<{ Params: { id: string } }>('/runs/:id/workflow.yaml', async (request, reply) => {
    const run = runner.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
      const run = runner.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
      const run = runner.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
      const result = runner.stepOutput(request.params.id, request.params.stepId);
      return result
        ? reply.header('Cache-Control', 'private, no-store').send(result)
        : reply.code(404).send({ error: 'Step output not found or not yet completed' });
    },
  );
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/runs/:id/logs',
    async (request, reply) => {
      const run = runner.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
      const cursor = request.query?.since;
      if (
        cursor !== undefined &&
        (!/^(0|[1-9][0-9]*)$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))
      )
        return reply.code(400).send({ error: 'Invalid journal cursor' });
      try {
        const log = await readFile(runtimePath('runs', `${request.params.id}.jsonl`), 'utf8');
        const page = parseRunJournal(
          log,
          request.params.id,
          cursor === undefined ? {} : { since: Number(cursor) },
        );
        return reply
          .header('Cache-Control', 'private, no-store')
          .header('X-Run-Journal-Truncated', String(page.truncated))
          .header('X-Run-Journal-Has-More', String(page.hasMore))
          .send(page.events);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return reply.code(404).send({ error: 'Journal unavailable' });
        if (error instanceof Error && error.message.startsWith('History incomplete'))
          return reply.code(409).send({
            error:
              'History incomplete: the durable journal ended mid-line; earlier events may be missing',
          });
        if (error instanceof Error && error.message === 'Corrupt run journal')
          return reply.code(409).send({ error: 'Corrupt run journal' });
        throw error;
      }
    },
  );

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
                ownerId,
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
        return reply
          .code(202)
          .send(runner.start({ ...rest, profileUrl: resolved, ownerId }, definitions));
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
      const run = runner.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
      const run = runner.get(request.params.id);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (run.ownerId !== undefined && run.ownerId !== ownerId)
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
    const run = runner.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
    return runner.pause(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run is not at a pausable state' });
  });
  app.post<{ Params: { id: string } }>('/runs/:id/resume', async (request, reply) => {
    const run = runner.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
    return runner.resume(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run is not paused' });
  });
  app.post<{ Params: { id: string } }>('/runs/:id/cancel', async (request, reply) => {
    const run = runner.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
    return runner.cancel(request.params.id)
      ? { accepted: true }
      : reply.code(409).send({ error: 'Run not active' });
  });

  app.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const runId = request.params.id;
    const run = runner.get(runId);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    if (!runIsAccessibleToOwner(run, ownerId))
      return reply.code(403).send({ error: 'Run not accessible to this owner' });
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
}
