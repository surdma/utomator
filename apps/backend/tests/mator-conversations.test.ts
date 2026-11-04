import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.equal(first.workflowId, workflowId);
  assert.equal(await getCurrentConversationId(docs, workflowId), first.id);

  const second = await createConversation(docs, workflowId, 'Second thread');
  assert.equal(await getCurrentConversationId(docs, workflowId), second.id);

  const threads = await listConversations(docs, workflowId);
  assert.equal(threads.length, 2);
  assert.deepEqual(new Set(threads.map((c) => c.id)), new Set([first.id, second.id]));

  await setCurrentConversation(docs, workflowId, first.id);
  assert.equal(await getCurrentConversationId(docs, workflowId), first.id);

  const touchedWorkflowYaml = [...docs.rows.keys()].some(
    (k) =>
      k.startsWith('workflows:') ||
      k.startsWith('workflow-revisions:') ||
      k.startsWith('workflow-plans:'),
  );
  assert.equal(touchedWorkflowYaml, false);

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
  assert.equal(duplicate.id, userEvent.id);
  assert.equal(duplicate.text, 'hello');

  await appendEvent(docs, first.id, { role: 'assistant', kind: 'message', text: 'hi there' });

  const events = await listEvents(docs, first.id, {});
  assert.equal(events.length, 2);
  const [firstEvent, secondEvent] = events;
  assert.equal(firstEvent?.id, userEvent.id);
  assert.equal(firstEvent?.text, 'hello');
  assert.equal(secondEvent?.text, 'hi there');

  const indexKey = `${MATOR_CONVERSATIONS_NAMESPACE}:workflow:${workflowId}`;
  assert.ok(docs.rows.has(indexKey));
  const messageKeys = [...docs.rows.keys()].filter((k) => k.startsWith(`${MATOR_MESSAGES_NAMESPACE}:`));
  assert.ok(messageKeys.some((k) => k.includes(`${first.id}:0`)));
});

test('concurrent append with same idempotencyKey stores one event', async () => {
  const docs = new FakeDocuments('local-owner');
  const conv = await createConversation(docs, 'wf-idempotency-race');
  const input = { role: 'user' as const, kind: 'message', text: 'once' };

  const [first, second] = await Promise.all([
    appendEvent(docs, conv.id, input, { idempotencyKey: 'client-retry' }),
    appendEvent(docs, conv.id, input, { idempotencyKey: 'client-retry' }),
  ]);

  assert.equal(first.id, second.id);
  const events = await listEvents(docs, conv.id, {});
  assert.equal(events.length, 1);
  assert.equal(events.at(0)?.text, 'once');
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

  assert.equal(result.id, 'peer-event-id');
  assert.equal(result.text, 'peer-won');
  assert.equal((await listEvents(docs, conv.id, {})).length, 1);
});

test('listEvents respects cursor and limit', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-cursor';
  const conv = await createConversation(docs, workflowId);

  const e1 = await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'one' });
  const e2 = await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'two' });
  await appendEvent(docs, conv.id, { role: 'user', kind: 'message', text: 'three' });

  const page = await listEvents(docs, conv.id, { cursor: e1.id, limit: 1 });
  assert.equal(page.length, 1);
  assert.equal(page.at(0)?.id, e2.id);
});
