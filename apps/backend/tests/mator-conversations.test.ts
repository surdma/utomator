
import { test, expect } from 'vitest';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';
import {
  appendEvent,
  createConversation,
  getCurrentConversationId,
  listConversations,
  listEvents,
  MATOR_CONVERSATIONS_NAMESPACE,
  MATOR_MESSAGES_NAMESPACE,
  setCurrentConversation,
} from '../src/mator/mator-conversations.js';

type Row = { version: number; value: unknown };
class FakeDocuments implements DocumentStore {
  readonly dialect = 'sqlite' as const;
  readonly rows = new Map<string, Row>();
  constructor(readonly ownerId: string) {}
  async get<T>(namespace: string, key: string): Promise<DocumentRecord<T> | null> {
    const row = this.rows.get(`${namespace}:${key}`);
    return row ? { key, version: row.version, value: row.value as T } : null;
  }
  async put<T>(namespace: string, key: string, value: T, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!expectedVersion) {
      if (existing) throw Error('Database document changed. Reload before saving.');
      this.rows.set(id, { version: 1, value });
      return 1;
    }
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    existing.version = expectedVersion + 1;
    existing.value = value;
    return existing.version;
  }
  async list<T>(namespace: string) {
    return [...this.rows.entries()]
      .filter(([id]) => id.startsWith(`${namespace}:`))
      .map(([id, row]) => ({
        key: id.slice(namespace.length + 1),
        version: row.version,
        value: row.value as T,
      }));
  }
  async remove(namespace: string, key: string, expectedVersion: number) {
    const id = `${namespace}:${key}`,
      existing = this.rows.get(id);
    if (!existing || existing.version !== expectedVersion)
      throw Error('Database document changed. Reload before saving.');
    this.rows.delete(id);
  }
  async close() {}
}

test('two conversations, current pointer, idempotency, ordered events, setCurrent skips YAML', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-mator-chat-1';

  const first = await createConversation(docs, workflowId, 'First thread');
  expect(first.workflowId).toEqual(workflowId);
  expect(await getCurrentConversationId(docs, workflowId)).toEqual(first.id);

  const second = await createConversation(docs, workflowId, 'Second thread');
  expect(await getCurrentConversationId(docs, workflowId)).toEqual(second.id);

  const threads = await listConversations(docs, workflowId);
  expect(threads.length).toEqual(2);
  expect(new Set(threads.map((c) => c.id))).toEqual(new Set([first.id, second.id]));

  await setCurrentConversation(docs, workflowId, first.id);
  expect(await getCurrentConversationId(docs, workflowId)).toEqual(first.id);

  const touchedWorkflowYaml = [...docs.rows.keys()].some(
    (k) =>
      k.startsWith('workflows:') ||
      k.startsWith('workflow-revisions:') ||
      k.startsWith('workflow-plans:'),
  );
  expect(touchedWorkflowYaml).toEqual(false);

  const userEvent = await appendEvent(
    docs,
    first.id,
    { role: 'user', kind: 'message', text: 'hello' },
    { idempotencyKey: 'submit-once' },
  );
  const duplicate = await appendEvent(
    docs,
    first.id,
    { role: 'user', kind: 'message', text: 'ignored duplicate body' },
    { idempotencyKey: 'submit-once' },
  );
  expect(duplicate.id).toEqual(userEvent.id);
  expect(duplicate.text).toEqual('hello');

  await appendEvent(docs, first.id, { role: 'assistant', kind: 'message', text: 'hi there' });

  const events = await listEvents(docs, first.id, {});
  expect(events.length).toEqual(2);
  const [firstEvent, secondEvent] = events;
  expect(firstEvent?.id).toEqual(userEvent.id);
  expect(firstEvent?.text).toEqual('hello');
  expect(secondEvent?.text).toEqual('hi there');

  const indexKey = `${MATOR_CONVERSATIONS_NAMESPACE}:workflow:${workflowId}`;
  expect(docs.rows.has(indexKey)).toBeTruthy();
  const messageKeys = [...docs.rows.keys()].filter((k) => k.startsWith(`${MATOR_MESSAGES_NAMESPACE}:`));
  expect(messageKeys.some((k) => k.includes(`${first.id}:0`))).toBeTruthy();
});

test('concurrent append with same idempotencyKey stores one event', async () => {
  const docs = new FakeDocuments('local-owner');
  const conv = await createConversation(docs, 'wf-idempotency-race');
  const input = { role: 'user' as const, kind: 'message', text: 'once' };

  const [first, second] = await Promise.all([
    appendEvent(docs, conv.id, input, { idempotencyKey: 'client-retry' }),
    appendEvent(docs, conv.id, input, { idempotencyKey: 'client-retry' }),
  ]);

  expect(first.id).toEqual(second.id);
  const events = await listEvents(docs, conv.id, {});
  expect(events.length).toEqual(1);
  expect(events.at(0)?.text).toEqual('once');
});

test('appendEvent re-scans idempotencyKey after CAS conflict on first chunk', async () => {
  class PeerWinsInsertDocuments extends FakeDocuments {
    override async put<T>(namespace: string, key: string, value: T, expectedVersion: number) {
      if (namespace === MATOR_MESSAGES_NAMESPACE && expectedVersion === 0) {
        const peerEvent = {
          id: 'peer-event-id',
          conversationId: key.replace(/:0$/, ''),
          role: 'user' as const,
          kind: 'message',
          text: 'peer-won',
          idempotencyKey: 'shared-key',
          createdAt: '2026-01-01T00:00:00.000Z',
        };
        await super.put(
          namespace,
          key,
          { events: [peerEvent], idempotencyKeys: { 'shared-key': peerEvent.id } },
          0,
        );
        throw Error('Database document changed. Reload before saving.');
      }
      return super.put(namespace, key, value, expectedVersion);
    }
  }

  const docs = new PeerWinsInsertDocuments('local-owner');
  const conv = await createConversation(docs, 'wf-cas-retry');
  const result = await appendEvent(
    docs,
    conv.id,
    { role: 'user', kind: 'message', text: 'local-loser' },
    { idempotencyKey: 'shared-key' },
  );

  expect(result.id).toEqual('peer-event-id');
  expect(result.text).toEqual('peer-won');
  expect((await listEvents(docs, conv.id, {})).length).toEqual(1);
});

test('listEvents respects cursor and limit', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-cursor';
  const conv = await createConversation(docs, workflowId);

  const e1 = await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'one' });
  const e2 = await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'two' });
  await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'three' });

  const page = await listEvents(docs, conv.id, { cursor: e1.id, limit: 1 });
  expect(page.length).toEqual(1);
  expect(page.at(0)?.id).toEqual(e2.id);
});
