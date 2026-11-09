import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { RunRequest, RunSummary } from '../src/domain/types.js';
import { defaultPlan, type WorkflowPlan } from '../src/domain/workflow-plan.js';
import type { DocumentRecord, DocumentStore } from '../src/infrastructure/db/documents.js';
import {
  applyAction,
  type MatorActionPorts,
  type MatorWorkflowPort,
} from '../src/infrastructure/mator/mator-actions.js';
import {
  createConversation,
  getConversationRunId,
  listConversations,
  setConversationRunId,
} from '../src/infrastructure/mator/mator-conversations.js';
import { Runner } from '../src/infrastructure/runs/runner.js';
import type { WorkflowRecord } from '../src/infrastructure/workflows/workflow-registry.js';

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

function makeRecord(plan: WorkflowPlan, revision = 1): WorkflowRecord {
  const now = new Date().toISOString();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: 'local-owner',
    templateId: null,
    revision,
    createdAt: now,
    updatedAt: now,
    plan,
  } as unknown as WorkflowRecord;
}

test('setConversationRunId / getConversationRunId persist the binding', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-identity-1';
  const conv = await createConversation(docs, workflowId, 'Identity thread');
  expect(await getConversationRunId(docs, conv.id)).toBeNull();

  await setConversationRunId(docs, workflowId, conv.id, 'run-abc-123');
  expect(await getConversationRunId(docs, conv.id)).toBe('run-abc-123');

  await setConversationRunId(docs, workflowId, conv.id, null);
  expect(await getConversationRunId(docs, conv.id)).toBeNull();
});

test('run_step stamps conversationId on the run and binds conversation→run', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-identity-2';
  const conv = await createConversation(docs, workflowId, 'Run thread');

  const plan = defaultPlan('x', 'audit');
  const record = { ...makeRecord(plan), id: workflowId };
  const captured: RunRequest[] = [];
  const ports: MatorActionPorts = {
    workflows: {
      get: async () => record,
      getRevision: async () => record,
      update: async () => record,
    } as unknown as MatorWorkflowPort,
    runner: {
      start: (request: RunRequest) => {
        captured.push(request);
        return {
          id: 'run-bound-to-conversation',
          platform: request.platform,
          action: request.action,
          state: 'running',
          createdAt: new Date().toISOString(),
          ownerId: request.ownerId,
          conversationId: request.conversationId,
          workflowId: request.workflowId,
          workflowRevision: request.workflowRevision,
        } as RunSummary;
      },
    },
  };

  const result = await applyAction(
    docs,
    ports,
    {
      workflowId,
      conversationId: conv.id,
      eventId: 'evt-1',
      action: {
        type: 'run_step',
        stepId: 'action',
        request: {
          platform: 'x',
          action: 'audit',
          profileUrl: 'https://x.com/surdma',
          workflowId,
          workflowRevision: 1,
          ownerId: '22222222-2222-4222-8222-222222222222',
        },
      },
    },
    { squash: false },
  );

  expect(captured).toHaveLength(1);
  expect(captured[0]!.conversationId).toBe(conv.id);
  expect(captured[0]!.ownerId).toBe('local-owner');
  expect(result.run?.conversationId).toBe(conv.id);
  expect(result.run?.ownerId).toBe('local-owner');
  expect(await getConversationRunId(docs, conv.id)).toBe('run-bound-to-conversation');
  expect(result.event.action).toMatchObject({ type: 'run_step' });
});

test('conversations list is unaffected by run binding', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-identity-3';
  const c1 = await createConversation(docs, workflowId, 'One');
  const c2 = await createConversation(docs, workflowId, 'Two');
  await setConversationRunId(docs, workflowId, c1.id, 'run-one');
  const threads = await listConversations(docs, workflowId);
  expect(threads.length).toBe(2);
  expect(new Set(threads.map((c) => c.id))).toEqual(new Set([c1.id, c2.id]));
});

test('run_step always binds conversation→run via applyAction input', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflowId = 'wf-identity-4';
  const conv = await createConversation(docs, workflowId, 'Bind thread');

  const plan = defaultPlan('x', 'audit');
  const record = { ...makeRecord(plan), id: workflowId };
  const captured: RunRequest[] = [];
  const ports: MatorActionPorts = {
    workflows: {
      get: async () => record,
      getRevision: async () => record,
      update: async () => record,
    } as unknown as MatorWorkflowPort,
    runner: {
      start: (request: RunRequest) => {
        captured.push(request);
        return {
          id: 'run-always-bound',
          platform: request.platform,
          action: request.action,
          state: 'running',
          createdAt: new Date().toISOString(),
          conversationId: request.conversationId,
        } as RunSummary;
      },
    },
  };

  // The source request omits conversationId, but applyAction injects it.
  await applyAction(
    docs,
    ports,
    {
      workflowId,
      conversationId: conv.id,
      eventId: 'evt-2',
      action: {
        type: 'run_step',
        request: {
          platform: 'x',
          action: 'audit',
          profileUrl: 'https://x.com/surdma',
          workflowId,
          workflowRevision: record.revision,
        },
      },
    },
    { squash: false },
  );

  expect(captured).toHaveLength(1);
  expect(captured[0]!.conversationId).toBe(conv.id);
  expect(await getConversationRunId(docs, conv.id)).toBe('run-always-bound');
});

test('Runner.listByConversation returns only runs bound to that conversation', {
  timeout: 15000,
}, () => {
  const runner = new Runner();
  const a: RunSummary = {
    id: `run-alpha-${randomUUID()}`,
    platform: 'x',
    action: 'audit',
    state: 'running',
    createdAt: new Date().toISOString(),
    conversationId: `conv-alpha-${randomUUID()}`,
  };
  const b: RunSummary = {
    id: `run-beta-${randomUUID()}`,
    platform: 'x',
    action: 'audit',
    state: 'running',
    createdAt: new Date().toISOString(),
    conversationId: `conv-beta-${randomUUID()}`,
  };
  const unbound: RunSummary = {
    id: `run-unbound-${randomUUID()}`,
    platform: 'x',
    action: 'audit',
    state: 'running',
    createdAt: new Date().toISOString(),
  };
  runner.history.set(a.id, a);
  runner.history.set(b.id, b);
  runner.history.set(unbound.id, unbound);

  const alpha = runner.listByConversation(a.conversationId!);
  expect(alpha.some((r) => r.id === a.id)).toBe(true);
  expect(alpha.every((r) => r.conversationId === a.conversationId)).toBe(true);

  const beta = runner.listByConversation(b.conversationId!);
  expect(beta.some((r) => r.id === b.id)).toBe(true);
  expect(beta.every((r) => r.conversationId === b.conversationId)).toBe(true);

  const none = runner.listByConversation('conv-missing-that-does-not-exist');
  expect(none).toEqual([]);

  expect(runner.listByConversation(a.conversationId!).some((r) => r.id === unbound.id)).toBe(false);
  expect(runner.listByConversation(b.conversationId!).some((r) => r.id === unbound.id)).toBe(false);
});
