import type { FastifyInstance } from 'fastify';
import type { ConnectorService } from '../connect/service.js';
import type { ProfilePlanner } from '../profile/profile-planner.js';
import type { CareerStore } from '../profile/career-store.js';

/** Read-only full-profile optimization planning. Independent from social-site mutation. */
export function registerProfilePlanRoutes(
  app: FastifyInstance,
  stores: { profilePlanner: ProfilePlanner; connectors: ConnectorService; career: CareerStore },
) {
  const { profilePlanner, connectors, career } = stores;
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
}
