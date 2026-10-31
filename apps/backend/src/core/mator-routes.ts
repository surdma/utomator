import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DocumentStore } from '../db/documents.js';
import {
  applyAction,
  type MatorActionPorts,
  MatorActionValidationError,
  parseMatorAction,
  restoreConversationPipeline,
} from './mator-actions.js';
import { MatorConfigError, requireGroqKey, runMatorTurn } from './mator-agent.js';
import {
  getAttachmentFile,
  type MatorImageMarker,
  saveAttachment,
  upsertMarkers,
} from './mator-attachments.js';
import {
  appendEvent,
  createConversation,
  getCurrentConversationId,
  listConversations,
  listEvents,
  MATOR_CONVERSATIONS_NAMESPACE,
  type MatorConversation,
  setCurrentConversation,
} from './mator-conversations.js';
import { synthesizeSpeech, transcribeAudio } from './mator-groq.js';
import { findMatorModel, MATOR_MODEL_CATALOG, MATOR_TTS_VOICES } from './mator-models.js';
import {
  getMatorSettings,
  groqKeySource,
  MATOR_SETTINGS_KEY,
  MATOR_SETTINGS_NAMESPACE,
  type MatorSettings,
  type MatorSettingsPatch,
  putMatorSettings,
} from './mator-settings.js';

export type MatorRouteDeps = {
  getDocuments: () => DocumentStore | undefined;
  ports: MatorActionPorts;
  fetch?: typeof globalThis.fetch;
  attachmentRoot?: string;
};

type WorkflowConversationIndex = {
  currentId: string | null;
  items: MatorConversation[];
};

const jsonError = (reply: FastifyReply, status: number, error: string) =>
  reply.code(status).send({ error });

async function requireDocuments(
  deps: MatorRouteDeps,
  reply: FastifyReply,
): Promise<DocumentStore | undefined> {
  const docs = deps.getDocuments();
  if (!docs) {
    await jsonError(reply, 503, 'Mator storage unavailable');
    return undefined;
  }
  return docs;
}

async function findConversation(
  docs: DocumentStore,
  conversationId: string,
): Promise<{ workflowId: string; conversation: MatorConversation } | null> {
  const records = await docs.list<WorkflowConversationIndex>(MATOR_CONVERSATIONS_NAMESPACE);
  for (const record of records) {
    if (!record.key.startsWith('workflow:')) continue;
    const hit = record.value.items.find((item) => item.id === conversationId);
    if (hit) return { workflowId: hit.workflowId, conversation: hit };
  }
  return null;
}

function maskedSettings(settings: MatorSettings) {
  const chat = findMatorModel(settings.modelId);
  const source = groqKeySource(settings);
  return {
    groqKeyConfigured: source !== 'none',
    keySource: source,
    autoApprove: settings.autoApprove,
    squashPipelineHistory: settings.squashPipelineHistory,
    howTtsEnabled: settings.howTtsEnabled,
    moderationEnabled: settings.moderationEnabled,
    modelId: settings.modelId,
    modelName: chat?.name ?? settings.modelId,
    modelLabel: chat?.label ?? 'Chat',
    modelTier: chat?.tier ?? 'paid',
    modelPrice: chat?.price ?? '',
    reasoningEffort: settings.reasoningEffort,
    visionModelId: settings.visionModelId,
    sttModelId: settings.sttModelId,
    ttsModelId: settings.ttsModelId,
    ttsVoice: settings.ttsVoice,
  };
}

async function putSettingsWithRetry(docs: DocumentStore, patch: MatorSettingsPatch) {
  for (;;) {
    const record = await docs.get<MatorSettings>(MATOR_SETTINGS_NAMESPACE, MATOR_SETTINGS_KEY);
    try {
      await putMatorSettings(docs, patch, record?.version ?? 0);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }
}

function plansEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function httpStatusForError(error: unknown): number {
  if (error instanceof MatorConfigError) return 400;
  if (error instanceof MatorActionValidationError) return 400;
  const message = error instanceof Error ? error.message : '';
  if (/not found/i.test(message)) return 404;
  if (/conflict|changed|dirty/i.test(message)) return 409;
  return 400;
}

function errorMessage(error: unknown): string {
  if (error instanceof MatorConfigError) {
    return `${error.message}. ${error.hint}`;
  }
  return error instanceof Error ? error.message : 'Request failed';
}

export function registerMatorRoutes(app: FastifyInstance, deps: MatorRouteDeps): void {
  app.get('/mator/models', async () => ({
    models: MATOR_MODEL_CATALOG,
    voices: MATOR_TTS_VOICES,
  }));

  app.get('/mator/settings', async (_request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    return maskedSettings(await getMatorSettings(docs));
  });

  app.put<{ Body: MatorSettingsPatch }>('/mator/settings', async (request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    try {
      const body = request.body ?? {};
      const patch: MatorSettingsPatch = {};
      if ('groqApiKey' in body) patch.groqApiKey = body.groqApiKey;
      if (typeof body.autoApprove === 'boolean') patch.autoApprove = body.autoApprove;
      if (typeof body.squashPipelineHistory === 'boolean')
        patch.squashPipelineHistory = body.squashPipelineHistory;
      if (typeof body.howTtsEnabled === 'boolean') patch.howTtsEnabled = body.howTtsEnabled;
      if (typeof body.moderationEnabled === 'boolean') patch.moderationEnabled = body.moderationEnabled;
      if (typeof body.modelId === 'string') patch.modelId = body.modelId;
      if (
        body.reasoningEffort === 'low' ||
        body.reasoningEffort === 'medium' ||
        body.reasoningEffort === 'high'
      )
        patch.reasoningEffort = body.reasoningEffort;
      if (typeof body.visionModelId === 'string') patch.visionModelId = body.visionModelId;
      if (typeof body.sttModelId === 'string') patch.sttModelId = body.sttModelId;
      if (typeof body.ttsModelId === 'string') patch.ttsModelId = body.ttsModelId;
      if (typeof body.ttsVoice === 'string') patch.ttsVoice = body.ttsVoice;
      await putSettingsWithRetry(docs, patch);
      return maskedSettings(await getMatorSettings(docs));
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  });

  app.get<{ Params: { workflowId: string } }>(
    '/mator/workflows/:workflowId/conversations',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const workflowId = request.params.workflowId;
        const [items, currentId] = await Promise.all([
          listConversations(docs, workflowId),
          getCurrentConversationId(docs, workflowId),
        ]);
        return { currentId, items };
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.post<{ Params: { workflowId: string }; Body: { title?: string } }>(
    '/mator/workflows/:workflowId/conversations',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const conversation = await createConversation(
          docs,
          request.params.workflowId,
          request.body?.title,
        );
        return reply.code(201).send(conversation);
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.post<{ Params: { workflowId: string }; Body: { conversationId: string } }>(
    '/mator/workflows/:workflowId/current',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const conversationId = request.body?.conversationId;
        if (typeof conversationId !== 'string' || !conversationId)
          return jsonError(reply, 400, 'conversationId is required');
        // Switch marks current only — never swaps live YAML.
        await setCurrentConversation(docs, request.params.workflowId, conversationId);
        return { currentId: conversationId };
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>(
    '/mator/conversations/:id/events',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const located = await findConversation(docs, request.params.id);
        if (!located) return jsonError(reply, 404, 'Conversation not found');
        const limit = request.query.limit ? Number(request.query.limit) : undefined;
        return listEvents(docs, request.params.id, {
          cursor: request.query.cursor,
          limit: Number.isFinite(limit) ? limit : undefined,
        });
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/mator/conversations/:id/events/stream',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const located = await findConversation(docs, request.params.id);
        if (!located) return jsonError(reply, 404, 'Conversation not found');
        const events = await listEvents(docs, request.params.id, {});
        const chunks: string[] = [];
        for (const event of events) {
          chunks.push(`id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        chunks.push('event: done\ndata: {}\n\n');
        return reply
          .header('Content-Type', 'text/event-stream; charset=utf-8')
          .header('Cache-Control', 'no-cache, no-transform')
          .header('X-Accel-Buffering', 'no')
          .send(chunks.join(''));
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { text?: string; attachmentIds?: string[] };
  }>('/mator/conversations/:id/messages', async (request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey =
      typeof idempotencyKeyHeader === 'string'
        ? idempotencyKeyHeader
        : Array.isArray(idempotencyKeyHeader)
          ? idempotencyKeyHeader[0]
          : undefined;
    if (!idempotencyKey?.trim()) return jsonError(reply, 400, 'Idempotency-Key header is required');
    try {
      const located = await findConversation(docs, request.params.id);
      if (!located) return jsonError(reply, 404, 'Conversation not found');
      const result = await runMatorTurn(
        docs,
        deps.ports,
        {
          conversationId: request.params.id,
          userText: request.body?.text,
          attachmentIds: request.body?.attachmentIds,
          idempotencyKey: idempotencyKey.trim(),
        },
        { fetch: deps.fetch },
      );
      return { events: result.events };
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  });

  const stageDecision = async (
    request: FastifyRequest<{ Params: { id: string; eventId: string } }>,
    reply: FastifyReply,
    decision: 'confirm' | 'reject',
  ) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    try {
      const located = await findConversation(docs, request.params.id);
      if (!located) return jsonError(reply, 404, 'Conversation not found');
      const events = await listEvents(docs, request.params.id, {});
      const staged = events.find((event) => event.id === request.params.eventId);
      if (!staged) return jsonError(reply, 404, 'Event not found');
      if (staged.status !== 'staged') return jsonError(reply, 409, 'Event is not a staged action');
      if (decision === 'reject') {
        const event = await appendEvent(docs, request.params.id, {
          role: 'assistant',
          kind: 'action',
          action: staged.action,
          status: 'rejected',
          ...(staged.text ? { text: staged.text } : {}),
        });
        return { event };
      }
      const action = parseMatorAction(staged.action);
      const settings = await getMatorSettings(docs);
      const applied = await applyAction(
        docs,
        deps.ports,
        {
          workflowId: located.workflowId,
          conversationId: request.params.id,
          eventId: staged.id,
          action,
        },
        { squash: settings.squashPipelineHistory, conversationId: request.params.id },
      );
      return { event: applied.event, record: applied.record, run: applied.run };
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  };

  app.post<{ Params: { id: string; eventId: string } }>(
    '/mator/conversations/:id/stage/:eventId/confirm',
    (request, reply) => stageDecision(request, reply, 'confirm'),
  );
  app.post<{ Params: { id: string; eventId: string } }>(
    '/mator/conversations/:id/stage/:eventId/reject',
    (request, reply) => stageDecision(request, reply, 'reject'),
  );

  app.post<{ Params: { id: string }; Body: { confirmDirty?: boolean } }>(
    '/mator/conversations/:id/restore-pipeline',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const located = await findConversation(docs, request.params.id);
        if (!located) return jsonError(reply, 404, 'Conversation not found');
        const { conversation, workflowId } = located;
        if (!conversation.boundRevisionId)
          return jsonError(reply, 400, 'Conversation has no bound pipeline revision');

        const live = await deps.ports.workflows.get(workflowId);
        if (!live) return jsonError(reply, 404, 'Workflow not found');

        const split = conversation.boundRevisionId.lastIndexOf(':');
        const revision = Number.parseInt(conversation.boundRevisionId.slice(split + 1), 10);
        const bound = await deps.ports.workflows.getRevision(workflowId, revision);
        if (!bound) return jsonError(reply, 400, 'Bound revision not found');

        const dirty = !plansEqual(live.plan, bound.plan);
        if (dirty && request.body?.confirmDirty !== true) {
          return jsonError(reply, 409, 'Live pipeline is dirty; pass confirmDirty: true to overwrite');
        }

        const record = await restoreConversationPipeline(
          docs,
          deps.ports.workflows,
          workflowId,
          request.params.id,
        );
        await appendEvent(docs, request.params.id, {
          role: 'system',
          kind: 'restore',
          text: `Restored pipeline revision ${conversation.boundRevisionId}`,
        });
        return { record };
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.post<{ Body: { data?: string; mime?: string; filename?: string } }>(
    '/mator/audio/transcriptions',
    { bodyLimit: 26 * 1024 * 1024 },
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        const { data, mime, filename } = request.body ?? {};
        if (typeof data !== 'string' || !data) return jsonError(reply, 400, 'data (base64) is required');
        if (typeof mime !== 'string' || !mime.startsWith('audio/'))
          return jsonError(reply, 400, 'An audio mime type is required');
        const settings = await getMatorSettings(docs);
        const apiKey = requireGroqKey(docs, settings);
        const bytes = Buffer.from(data, 'base64');
        if (!bytes.length) return jsonError(reply, 400, 'Audio payload is empty');
        const transcript = await transcribeAudio(
          apiKey,
          {
            bytes,
            filename: typeof filename === 'string' && filename.trim() ? filename.trim() : 'speech.webm',
            mime,
          },
          { fetch: deps.fetch, modelId: settings.sttModelId },
        );
        return { text: transcript.text };
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.post<{ Body: { text?: string } }>('/mator/audio/speech', async (request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    try {
      const text = request.body?.text?.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) return jsonError(reply, 400, 'text is required');
      if (text.length > 4000) return jsonError(reply, 400, 'text is too long to speak');
      const settings = await getMatorSettings(docs);
      const apiKey = requireGroqKey(docs, settings);
      const wav = await synthesizeSpeech(apiKey, text, {
        fetch: deps.fetch,
        modelId: settings.ttsModelId,
        voice: settings.ttsVoice,
      });
      return reply.type('audio/wav').send(wav);
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  });

  app.post<{
    Params: { id: string };
    Body: { filename?: string; mime?: string; data?: string };
  }>('/mator/conversations/:id/attachments', { bodyLimit: 24 * 1024 * 1024 }, async (request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    try {
      const located = await findConversation(docs, request.params.id);
      if (!located) return jsonError(reply, 404, 'Conversation not found');
      const { filename, mime, data } = request.body ?? {};
      if (typeof filename !== 'string' || !filename.trim())
        return jsonError(reply, 400, 'filename is required');
      if (typeof mime !== 'string' || !mime.trim()) return jsonError(reply, 400, 'mime is required');
      if (typeof data !== 'string' || !data) return jsonError(reply, 400, 'data (base64) is required');
      let bytes: Buffer;
      try {
        bytes = Buffer.from(data, 'base64');
      } catch {
        return jsonError(reply, 400, 'Invalid base64 attachment data');
      }
      if (!bytes.length) return jsonError(reply, 400, 'Attachment data is empty');
      const saved = await saveAttachment(
        docs,
        {
          conversationId: request.params.id,
          filename,
          mime,
          bytes,
        },
        deps.attachmentRoot ? { root: deps.attachmentRoot } : undefined,
      );
      return reply.code(201).send(saved);
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  });

  app.patch<{ Params: { id: string }; Body: { markers?: MatorImageMarker[] } }>(
    '/mator/attachments/:id/markers',
    async (request, reply) => {
      const docs = await requireDocuments(deps, reply);
      if (!docs) return;
      try {
        if (!Array.isArray(request.body?.markers))
          return jsonError(reply, 400, 'markers array is required');
        const meta = await upsertMarkers(docs, request.params.id, request.body.markers);
        return meta;
      } catch (error) {
        return jsonError(reply, httpStatusForError(error), errorMessage(error));
      }
    },
  );

  app.get<{ Params: { id: string } }>('/mator/attachments/:id', async (request, reply) => {
    const docs = await requireDocuments(deps, reply);
    if (!docs) return;
    try {
      const loaded = await getAttachmentFile(
        docs,
        request.params.id,
        deps.attachmentRoot ? { root: deps.attachmentRoot } : undefined,
      );
      return reply
        .header('content-type', loaded.meta.mime)
        .header('content-disposition', `inline; filename="${loaded.meta.filename.replace(/"/g, '')}"`)
        .send(loaded.bytes);
    } catch (error) {
      return jsonError(reply, httpStatusForError(error), errorMessage(error));
    }
  });
}
