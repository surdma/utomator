import type { FastifyInstance } from 'fastify';
import type { ActivityMemory } from '../mator/activity-memory.js';
import type { Platform } from '../core/types.js';

/** Intelligence routes: the operator's chat-backed activity memory. */
export function registerIntelligenceRoutes(app: FastifyInstance, activityMemory: ActivityMemory) {
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
}
