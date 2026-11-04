import type { FastifyInstance } from 'fastify';
import type { CraftLibrary } from '../crafts/library.js';
import { type CraftInput, craftArchive, parseMdx, toMdx } from '../crafts/library.js';

/** Craft authoring routes. Reads are public, mutations are owner-only via the auth hook. */
export function registerCraftRoutes(app: FastifyInstance, craftLibrary: CraftLibrary) {
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
}
