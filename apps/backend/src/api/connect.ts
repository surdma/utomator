import type { FastifyInstance } from 'fastify';
import type { BrokerInput } from '../browser/streaming-signin.js';
import type { ConnectorService } from '../connect/service.js';

/** Connector session routes: list, interactive sign-in, verify, sync, disconnect. */
export function registerConnectorRoutes(app: FastifyInstance, connectors: ConnectorService) {
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
  app.get<{ Params: { id: string } }>('/connectors/:id/view', async (request, reply) => {
    try {
      return await connectors.signInFrame(request.params.id);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Sign-in view unavailable',
      });
    }
  });
  app.post<{ Params: { id: string }; Body: BrokerInput }>(
    '/connectors/:id/input',
    async (request, reply) => {
      try {
        await connectors.signInInput(request.params.id, request.body);
        return { ok: true };
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Could not send sign-in input',
        });
      }
    },
  );
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
}
