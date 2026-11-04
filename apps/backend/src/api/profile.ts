import type { FastifyInstance } from 'fastify';
import type { ConnectorService } from '../connect/service.js';
import type { CareerStore } from '../profile/career-store.js';
import { loadAutomationPlaybook } from '../profile/playbook.js';
import type { AccountStore } from '../profile/account-store.js';
import type { LinkedInPublishingProvider } from '../linkedin/linkedin-publisher.js';
import type { DocumentStore } from '../db/documents.js';

/** Owner identity and career workspace routes plus read-only planning reads. */
export function registerProfileRoutes(
  app: FastifyInstance,
  stores: {
    accountStore: AccountStore;
    career: CareerStore;
    connectors: ConnectorService;
    linkedInPublisher: LinkedInPublishingProvider;
    database: () => DocumentStore | undefined;
  },
) {
  const { accountStore, career, connectors, linkedInPublisher } = stores;
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
        if (existing.platform === 'linkedin' && stores.database())
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
}
