import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { Runner } from './core/runner.js';
import type { RunRequest, StreamEvent } from './core/types.js';

export function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }, bodyLimit: 32 * 1024 });
  const runner = new Runner();
  app.register(fastifyStatic, { root: resolve(process.cwd(), 'src', 'web'), prefix: '/' });

  // A local UI is the only supported caller. Cross-site browser requests are rejected.
  app.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin) {
      const url = new URL(origin);
      const port = Number(process.env.PORT || 3101);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) ||
          url.port !== String(port) || url.protocol !== 'http:') {
        return reply.code(403).send({ error: 'Only the local dashboard can submit actions' });
      }
    }
  });

  const runBodySchema = {
    type: 'object', additionalProperties: false,
    required: ['platform', 'action', 'profileUrl'],
    properties: {
      platform: { enum: ['linkedin', 'x'] },
      action: { enum: ['audit', 'edit-profile', 'add-skill', 'compose-post', 'pin-post', 'delete-post', 'edit-experience', 'edit-website', 'edit-services', 'add-project', 'add-featured', 'upload-banner'] },
      profileUrl: { type: 'string', maxLength: 250 },
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
    },
  } as const;
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/runs', async () => runner.list());
  app.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const run = runner.get(request.params.id);
    return run ?? reply.code(404).send({ error: 'Run not found' });
  });
  app.post<{ Body: RunRequest }>('/runs', { schema: { body: runBodySchema } }, async (request, reply) => {
    try { return reply.code(202).send(runner.start(request.body)); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(message.startsWith('BUSY:') ? 409 : 400).send({ error: message });
    }
  });
  app.post<{ Params: { id: string }; Body: { checkpointId: string; approved: boolean } }>(
    '/runs/:id/decision',
    { schema: { body: { type: 'object', required: ['checkpointId', 'approved'], additionalProperties: false,
      properties: { checkpointId: { type: 'string', pattern: '^[a-f0-9-]{36}$' }, approved: { type: 'boolean' } } } } },
    async (request, reply) => {
      const ok = runner.decide(request.params.id, request.body.checkpointId, request.body.approved);
      return ok ? { accepted: true } : reply.code(409).send({ error: 'No matching pending checkpoint' });
    },
  );
  app.post<{ Params: { id: string }; Body: { checkpointId: string; value: string } }>(
    '/runs/:id/input',
    { schema: { body: { type: 'object', required: ['checkpointId', 'value'], additionalProperties: false,
      properties: { checkpointId: { type: 'string', pattern: '^[a-f0-9-]{36}$' }, value: { type: 'string', minLength: 1, maxLength: 300 } } } } },
    async (request, reply) => {
      const accepted = runner.answerText(request.params.id, request.body.checkpointId, request.body.value);
      return accepted ? { accepted: true } : reply.code(409).send({ error: 'No matching pending input' });
    },
  );
  app.post<{ Params: { id: string } }>('/runs/:id/cancel', async (request, reply) => {
    return runner.cancel(request.params.id) ? { accepted: true } : reply.code(409).send({ error: 'Run not active' });
  });

  app.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const runId = request.params.id;
    if (!runner.get(runId)) return reply.code(404).send({ error: 'Run not found' });
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
    const cursor = Number(request.headers['last-event-id'] || request.query && (request.query as { since?: string }).since || 0);
    for (const event of runner.events.getSince(Number.isFinite(cursor) ? cursor : 0, runId)) send(event);
    const unsubscribe = runner.events.subscribe(send);
    const heartbeat = setInterval(() => { if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n'); }, 15000);
    reply.raw.on('close', () => { unsubscribe(); clearInterval(heartbeat); });
  });
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = buildApp();
  const port = Number(process.env.PORT || 3101);
  app.listen({ host: '127.0.0.1', port }).catch((err: unknown) => { app.log.error(err); process.exitCode = 1; });
}
