import { randomUUID } from 'node:crypto';
import type { DocumentStore } from '../db/documents.js';

export const MATOR_CONVERSATIONS_NAMESPACE = 'mator-conversations';
export const MATOR_MESSAGES_NAMESPACE = 'mator-messages';

/** Stay below DocumentStore 512KB JSON cap with room for wrapper fields. */
const MESSAGE_CHUNK_BYTE_BUDGET = 480_000;

export type MatorConversation = {
  id: string;
  workflowId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  boundRevisionId: string | null;
};

export type MatorEvent = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  kind: string;
  text?: string;
  action?: unknown;
  attachmentId?: string; // Legacy single-asset events remain readable.
  attachments?: Array<{
    id: string;
    name: string;
    mime: string;
    markers?: Array<{ id: string; x: number; y: number; text: string }>;
    reviewId?: string;
  }>;
  markers?: Array<{ id: string; x: number; y: number; text: string }>;
  status?: 'staged' | 'applied' | 'rejected' | 'incomplete' | 'error';
  /** The exact staged proposal resolved by an apply/reject event. */
  resolvesEventId?: string;
  idempotencyKey?: string;
  createdAt: string;
};

export type MatorEventInput = Omit<MatorEvent, 'id' | 'conversationId' | 'createdAt'>;

type WorkflowConversationIndex = {
  currentId: string | null;
  items: MatorConversation[];
};

type MatorMessageChunk = {
  events: MatorEvent[];
  idempotencyKeys: Record<string, string>;
};

const workflowIndexKey = (workflowId: string) => `workflow:${workflowId}`;
const messageChunkKey = (conversationId: string, chunkIndex: number) =>
  `${conversationId}:${chunkIndex}`;

const nowIso = () => new Date().toISOString();

const chunkPayloadBytes = (chunk: MatorMessageChunk) => JSON.stringify(chunk).length;

async function loadWorkflowIndex(
  docs: DocumentStore,
  workflowId: string,
): Promise<{ key: string; version: number; value: WorkflowConversationIndex }> {
  const key = workflowIndexKey(workflowId);
  const record = await docs.get<WorkflowConversationIndex>(MATOR_CONVERSATIONS_NAMESPACE, key);
  return {
    key,
    version: record?.version ?? 0,
    value: record?.value ?? { currentId: null, items: [] },
  };
}

async function putWorkflowIndex(
  docs: DocumentStore,
  key: string,
  value: WorkflowConversationIndex,
  expectedVersion: number,
): Promise<void> {
  await docs.put(MATOR_CONVERSATIONS_NAMESPACE, key, value, expectedVersion);
}

async function updateWorkflowIndex(
  docs: DocumentStore,
  workflowId: string,
  mutate: (index: WorkflowConversationIndex) => WorkflowConversationIndex,
): Promise<WorkflowConversationIndex> {
  for (;;) {
    const loaded = await loadWorkflowIndex(docs, workflowId);
    const next = mutate(structuredClone(loaded.value));
    try {
      await putWorkflowIndex(docs, loaded.key, next, loaded.version);
      return next;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }
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

async function listMessageChunks(
  docs: DocumentStore,
  conversationId: string,
): Promise<Array<{ chunkIndex: number; version: number; value: MatorMessageChunk }>> {
  const prefix = `${conversationId}:`;
  const records = await docs.list<MatorMessageChunk>(MATOR_MESSAGES_NAMESPACE);
  return records
    .filter((row) => row.key.startsWith(prefix))
    .map((row) => ({
      chunkIndex: Number.parseInt(row.key.slice(prefix.length), 10),
      version: row.version,
      value: row.value,
    }))
    .filter((row) => Number.isInteger(row.chunkIndex) && row.chunkIndex >= 0)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

async function findEventByIdempotencyKey(
  docs: DocumentStore,
  conversationId: string,
  idempotencyKey: string,
): Promise<MatorEvent | null> {
  const chunks = await listMessageChunks(docs, conversationId);
  for (const chunk of chunks) {
    const eventId = chunk.value.idempotencyKeys[idempotencyKey];
    if (!eventId) continue;
    const event = chunk.value.events.find((item) => item.id === eventId);
    if (event) return event;
  }
  return null;
}

export async function listConversations(
  docs: DocumentStore,
  workflowId: string,
): Promise<MatorConversation[]> {
  const { value } = await loadWorkflowIndex(docs, workflowId);
  return [...value.items].sort((a, b) => {
    const aTime = a.lastMessageAt ?? a.updatedAt;
    const bTime = b.lastMessageAt ?? b.updatedAt;
    return bTime.localeCompare(aTime);
  });
}

export async function getCurrentConversationId(
  docs: DocumentStore,
  workflowId: string,
): Promise<string | null> {
  const { value } = await loadWorkflowIndex(docs, workflowId);
  return value.currentId;
}

export async function createConversation(
  docs: DocumentStore,
  workflowId: string,
  title?: string,
): Promise<MatorConversation> {
  const stamp = nowIso();
  const conversation: MatorConversation = {
    id: randomUUID(),
    workflowId,
    title: title?.trim() || 'New conversation',
    createdAt: stamp,
    updatedAt: stamp,
    lastMessageAt: null,
    boundRevisionId: null,
  };
  await updateWorkflowIndex(docs, workflowId, (index) => ({
    currentId: conversation.id,
    items: [...index.items, conversation],
  }));
  return conversation;
}

export async function setCurrentConversation(
  docs: DocumentStore,
  workflowId: string,
  conversationId: string,
): Promise<void> {
  await updateWorkflowIndex(docs, workflowId, (index) => {
    if (!index.items.some((item) => item.id === conversationId))
      throw Error('Conversation not found for workflow');
    return { ...index, currentId: conversationId };
  });
}

export async function appendEvent(
  docs: DocumentStore,
  conversationId: string,
  event: MatorEventInput,
  opts?: { idempotencyKey?: string },
): Promise<MatorEvent> {
  const idempotencyKey = opts?.idempotencyKey ?? event.idempotencyKey;
  if (idempotencyKey) {
    const existing = await findEventByIdempotencyKey(docs, conversationId, idempotencyKey);
    if (existing) return existing;
  }

  const located = await findConversation(docs, conversationId);
  if (!located) throw Error('Conversation not found');

  const createdAt = nowIso();
  const stored: MatorEvent = {
    ...event,
    id: randomUUID(),
    conversationId,
    createdAt,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };

  for (;;) {
    if (idempotencyKey) {
      const raced = await findEventByIdempotencyKey(docs, conversationId, idempotencyKey);
      if (raced) return raced;
    }

    const chunks = await listMessageChunks(docs, conversationId);
    const last = chunks.at(-1);
    let chunkIndex = last?.chunkIndex ?? -1;
    let chunk: MatorMessageChunk = last?.value ?? { events: [], idempotencyKeys: {} };
    let expectedVersion = last?.version ?? 0;

    const trial: MatorMessageChunk = {
      events: [...chunk.events, stored],
      idempotencyKeys: idempotencyKey
        ? { ...chunk.idempotencyKeys, [idempotencyKey]: stored.id }
        : { ...chunk.idempotencyKeys },
    };

    if (last && chunkPayloadBytes(trial) > MESSAGE_CHUNK_BYTE_BUDGET) {
      chunkIndex += 1;
      chunk = { events: [], idempotencyKeys: {} };
      expectedVersion = 0;
      const freshTrial: MatorMessageChunk = {
        events: [stored],
        idempotencyKeys: idempotencyKey ? { [idempotencyKey]: stored.id } : {},
      };
      if (chunkPayloadBytes(freshTrial) > MESSAGE_CHUNK_BYTE_BUDGET)
        throw Error('Database document size limit exceeded');
      try {
        await docs.put(
          MATOR_MESSAGES_NAMESPACE,
          messageChunkKey(conversationId, chunkIndex),
          freshTrial,
          expectedVersion,
        );
        break;
      } catch (error) {
        if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
        continue;
      }
    }

    if (!last) chunkIndex = 0;

    try {
      await docs.put(
        MATOR_MESSAGES_NAMESPACE,
        messageChunkKey(conversationId, chunkIndex),
        trial,
        expectedVersion,
      );
      break;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }

  await updateWorkflowIndex(docs, located.workflowId, (index) => ({
    ...index,
    items: index.items.map((item) =>
      item.id === conversationId ? { ...item, updatedAt: createdAt, lastMessageAt: createdAt } : item,
    ),
  }));

  return stored;
}

export async function listEvents(
  docs: DocumentStore,
  conversationId: string,
  options: { cursor?: string; limit?: number },
): Promise<MatorEvent[]> {
  const chunks = await listMessageChunks(docs, conversationId);
  let events = chunks.flatMap((chunk) => chunk.value.events);
  if (options.cursor) {
    const cursorIndex = events.findIndex((event) => event.id === options.cursor);
    events = cursorIndex >= 0 ? events.slice(cursorIndex + 1) : events;
  }
  if (typeof options.limit === 'number' && options.limit >= 0) events = events.slice(0, options.limit);
  return events;
}
