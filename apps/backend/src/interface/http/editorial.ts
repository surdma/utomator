import type { FastifyInstance } from 'fastify';
import type { CreatorResearchStore } from '../../infrastructure/linkedin/linkedin-creator-research.js';
import { researchYaml } from '../../infrastructure/linkedin/linkedin-creator-research.js';
import type { LinkedInEditorialStore } from '../../infrastructure/linkedin/linkedin-editorial.js';
import { editorialYaml } from '../../infrastructure/linkedin/linkedin-editorial.js';
import type {
  LinkedInProviderError,
  LinkedInPublishingProvider,
} from '../../infrastructure/linkedin/linkedin-publisher.js';
import { httpErrorResponse } from './http-error.js';

/**
 * Editorial publishing routes: OAuth authorization, internal draft CRUD, and
 * read-only owner-supplied research. Publication is only through the confirmed
 * publish endpoint; everything else is workspace bookkeeping.
 */
export function registerEditorialRoutes(
  app: FastifyInstance,
  linkedInPublisher: LinkedInPublishingProvider,
  linkedInEditorial: LinkedInEditorialStore,
  linkedInResearch: CreatorResearchStore,
) {
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
      const http = httpErrorResponse(error, {
        fallback: 'Unable to update draft',
        defaultStatus: 400,
        conflictOnVersion: true,
        notFound: true,
      });
      return reply.code(http.status).send({ error: http.error });
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
      const http = httpErrorResponse(error, {
        fallback: 'Unable to change draft state',
        defaultStatus: 400,
        conflictOnVersion: true,
        notFound: true,
      });
      return reply.code(http.status).send({ error: http.error });
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
}
