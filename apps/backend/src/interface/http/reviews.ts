import type { FastifyInstance } from 'fastify';
import type { Platform } from '../../domain/types.js';
import { loadIdentityTimeline } from '../../infrastructure/profile/profile-timeline.js';
import type {
  AnnotationEditEvent,
  VisualAnnotation,
  VisualRegion,
  VisualReviewStore,
} from '../../infrastructure/runs/visual-review.js';

/**
 * Operator review routes: visual reviews over run evidence, identity memory
 * notes, and the read-only identity timeline. Reviewing is an owner action;
 * annotations are intent, never browser selectors.
 */
export function registerReviewRoutes(app: FastifyInstance, visual: VisualReviewStore, ownerId: string) {
  // Visual reviews store only bounded image bytes and explicit operator
  // annotations; image pixels are never translated into unapproved clicks.
  app.get('/visual-reviews', async () => visual.listReviews());
  app.get<{ Params: { id: string } }>('/visual-reviews/:id/image', async (request, reply) => {
    const result = await visual.imageFor(request.params.id);
    if (!result) return reply.code(404).send({ error: 'Image not found' });
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(result.mime)
      .send(result.bytes);
  });
  app.get<{ Params: { id: string } }>('/visual-reviews/:id/yaml', async (request, reply) => {
    const yaml = await visual.yamlFor(request.params.id);
    if (!yaml) return reply.code(404).send({ error: 'Annotation YAML not found' });
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type('text/yaml; charset=utf-8')
      .send(yaml);
  });
  app.post<{
    Body: {
      platform: Platform;
      handle: string;
      pageUrl: string;
      nodeId: string;
      note: string;
      regions?: VisualRegion[];
      annotations?: VisualAnnotation[];
      editEvents?: AnnotationEditEvent[];
      source:
        | { kind: 'capture'; runId: string; fileName: string }
        | { kind: 'upload'; imageData: string }
        | { kind: 'review'; reviewId: string };
    };
  }>('/visual-reviews', { bodyLimit: 3 * 1024 * 1024 }, async (request, reply) => {
    try {
      const entry = await visual.addReview(request.body);
      return reply.code(201).send(entry);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Invalid visual review',
      });
    }
  });
  app.get('/identity-memory', async () => visual.listNotes());
  app.get('/identity-timeline', async () => loadIdentityTimeline(ownerId));
  app.post<{
    Body: { platform: Platform; handle: string; pageUrl: string; text: string };
  }>(
    '/identity-memory',
    {
      schema: {
        body: {
          type: 'object',
          required: ['platform', 'handle', 'pageUrl', 'text'],
          additionalProperties: false,
          properties: {
            platform: { enum: ['linkedin', 'x'] },
            handle: { type: 'string', minLength: 1, maxLength: 100 },
            pageUrl: { type: 'string', minLength: 10, maxLength: 400 },
            text: { type: 'string', minLength: 3, maxLength: 800 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send(await visual.addNote(request.body));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Invalid memory note',
        });
      }
    },
  );
}
