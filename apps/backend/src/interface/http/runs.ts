import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { isOwnedBy, isTrustedOwnerId } from '../../domain/ownership.js';
import type { RunRequest, RunSummary, StreamEvent } from '../../domain/types.js';
import type { ConnectorService } from '../../infrastructure/connect/service.js';
import { assessAudit } from '../../infrastructure/runs/assessment.js';
import { prepareRun, RunPreparationError } from '../../infrastructure/runs/prepare-run.js';
import type { Runner } from '../../infrastructure/runs/runner.js';
import { runtimePath } from '../../infrastructure/runtime/paths.js';
import type { StepDefinitionStore } from '../../infrastructure/workflows/step-definitions.js';
import type { WorkflowRegistry } from '../../infrastructure/workflows/workflow-registry.js';

/** Legacy ownerless runs must be recreated under an authenticated owner. */
export function runIsAccessibleToOwner(run: RunSummary, ownerId: string): boolean {
  return isOwnedBy(run, ownerId);
}

function journalCursor(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw Error('Invalid journal cursor');
  return Number(value);
}

function journalFailure(reply: FastifyReply, error: unknown) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT')
    return reply.code(404).send({ error: 'Journal unavailable' });
  if (error instanceof Error && error.message.startsWith('History incomplete'))
    return reply
      .code(409)
      .send({ error: 'History incomplete: durable run events could not be verified' });
  if (error instanceof Error && error.message === 'Corrupt run journal')
    return reply.code(409).send({ error: 'Corrupt run journal' });
  throw error;
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
  app.get<{ Querystring: { conversationId?: string } }>('/runs', async (request, reply) => {
    if (!isTrustedOwnerId(ownerId))
      return reply.code(401).send({ error: 'Owner authentication required' });
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
      if (!runIsAccessibleToOwner(run, ownerId))
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
      if (!runIsAccessibleToOwner(run, ownerId))
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
      if (!runIsAccessibleToOwner(run, ownerId))
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
      if (!runIsAccessibleToOwner(run, ownerId))
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
      let cursor: number | undefined;
      try {
        cursor = journalCursor(request.query?.since);
      } catch {
        return reply.code(400).send({ error: 'Invalid journal cursor' });
      }
      try {
        const page = await runner.journalPage(
          request.params.id,
          cursor === undefined ? {} : { since: cursor },
        );
        return reply
          .header('Cache-Control', 'private, no-store')
          .header('X-Run-Journal-Truncated', String(page.truncated))
          .header('X-Run-Journal-Has-More', String(page.hasMore))
          .send(page.events);
      } catch (error) {
        return journalFailure(reply, error);
      }
    },
  );

  app.post<{ Body: RunRequest & { handle?: string } }>(
    '/runs',
    { schema: { body: runBodySchema } },
    async (request, reply) => {
      if (!isTrustedOwnerId(ownerId))
        return reply.code(401).send({ error: 'Owner authentication required' });
      try {
        const prepared = await prepareRun(request.body, ownerId, stores);
        return reply.code(202).send(runner.start(prepared.request, prepared.definitions));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply
          .code(
            error instanceof RunPreparationError
              ? error.statusCode
              : message.startsWith('BUSY:')
                ? 409
                : 400,
          )
          .send({ error: message });
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
      if (!runIsAccessibleToOwner(run, ownerId))
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
      if (!runIsAccessibleToOwner(run, ownerId))
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

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/events/:id',
    async (request, reply) => {
      const runId = request.params.id;
      const run = runner.get(runId);
      if (!run) return reply.code(404).send({ error: 'Run not found' });
      if (!runIsAccessibleToOwner(run, ownerId))
        return reply.code(403).send({ error: 'Run not accessible to this owner' });
      let cursor: number;
      try {
        const query = journalCursor(request.query.since);
        cursor = journalCursor(request.headers['last-event-id']) ?? query ?? 0;
      } catch {
        return reply.code(400).send({ error: 'Invalid journal cursor' });
      }

      let replaying = true;
      let closed = false;
      let lastSent = cursor;
      let conflict = false;
      let heartbeat: NodeJS.Timeout | undefined;
      const buffered = new Map<number, StreamEvent>();
      const delivered = new Map<number, StreamEvent>();
      const send = (event: StreamEvent) => {
        if (closed || event.runId !== runId || event.id <= cursor) return;
        const prior = delivered.get(event.id);
        if (prior) {
          if (!isDeepStrictEqual(prior, event)) throw Error('Corrupt run journal');
          return;
        }
        if (!Number.isSafeInteger(event.id) || event.id <= lastSent) throw Error('Corrupt run journal');
        delivered.set(event.id, event);
        lastSent = event.id;
        reply.raw.write(`id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      // Subscribe before disk I/O. Events committed during replay join the same
      // ordered stream, including an event already present in the page being read.
      const unsubscribe = runner.events.subscribe((published) => {
        if (closed || published.runId !== runId || published.id <= cursor) return;
        try {
          // Compare the persisted JSON values: optional undefined fields are absent on disk.
          const event = JSON.parse(JSON.stringify(published)) as StreamEvent;
          if (replaying) {
            const prior = buffered.get(event.id);
            if (prior && !isDeepStrictEqual(prior, event)) conflict = true;
            else buffered.set(event.id, event);
            return;
          }
          send(event);
        } catch {
          if (replaying) {
            conflict = true;
            return;
          }
          cleanup();
          reply.raw.destroy();
        }
      });
      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        buffered.clear();
        delivered.clear();
      };
      reply.raw.once('close', cleanup);
      try {
        const replay = new Map<number, StreamEvent>();
        let since = cursor;
        for (;;) {
          const page = await runner.journalPage(runId, { since, limit: 1000 });
          if (closed) return reply;
          for (const event of page.events) {
            if (event.runId !== runId || event.id <= since) throw Error('Corrupt run journal');
            replay.set(event.id, event);
            since = event.id;
          }
          if (!page.hasMore) break;
          if (!page.events.length) throw Error('Corrupt run journal');
        }
        for (const event of buffered.values()) {
          const prior = replay.get(event.id);
          if (prior && !isDeepStrictEqual(prior, event)) conflict = true;
          replay.set(event.id, event);
        }
        if (conflict) throw Error('Corrupt run journal');
        reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'private, no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });
        reply.raw.flushHeaders();
        for (const event of [...replay.values()].sort((a, b) => a.id - b.id)) send(event);
        buffered.clear();
        replaying = false;
        heartbeat = setInterval(() => {
          if (!closed && !reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
        }, 15000);
        return reply;
      } catch (error) {
        cleanup();
        if (reply.raw.headersSent) {
          reply.raw.destroy();
          return reply;
        }
        return journalFailure(reply, error);
      }
    },
  );
}
