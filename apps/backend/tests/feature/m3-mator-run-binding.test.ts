import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import type { RunRequest, RunSummary } from '../../src/domain/types.js';
import { defaultPlan, type WorkflowPlan } from '../../src/domain/workflow-plan.js';
import { createDocumentStore } from '../../src/infrastructure/db/documents.js';
import { appendEvent, createConversation } from '../../src/infrastructure/mator/mator-conversations.js';
import { StepDefinitionStore } from '../../src/infrastructure/workflows/step-definitions.js';
import { WorkflowRegistry } from '../../src/infrastructure/workflows/workflow-registry.js';

const root = await mkdtemp(resolve(tmpdir(), 'utomator-m3-mator-'));
vi.mock('../../src/infrastructure/runtime/paths.js', () => ({
  RUNTIME_DIR: root,
  runtimePath: (...parts: string[]) => resolve(root, ...parts),
}));
const { buildApp } = await import('../../src/main.js');
const { Runner } = await import('../../src/infrastructure/runs/runner.js');
const { stageAction, workflowRegistryPort } = await import(
  '../../src/infrastructure/mator/mator-actions.js'
);
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function fixture(plan = defaultPlan('x', 'audit')) {
  const databaseUrl = 'file:' + resolve(root, randomUUID() + '.db');
  const client = createClient({ url: databaseUrl });
  await client.execute(
    'CREATE TABLE utomator_documents(' +
      'owner_id TEXT NOT NULL, namespace TEXT NOT NULL, record_key TEXT NOT NULL,' +
      'version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL,' +
      'PRIMARY KEY(owner_id, namespace, record_key))',
  );
  client.close();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('UTOMATOR_TEST_DATABASE', 'true');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DB_FILE_NAME', databaseUrl);
  vi.stubEnv('UTOMATOR_INTERNAL_OWNER_ID', alice);
  vi.stubEnv('UTOMATOR_INTERNAL_TOKEN', 'mator-fixture-token');
  const docs = await createDocumentStore(process.env, alice);
  const registry = new WorkflowRegistry(resolve(root, 'workflows'), resolve(root, 'legacy'));
  registry.setDocuments(docs);
  const record = await registry.create(plan);
  const conversation = await createConversation(docs, record.id, 'Pinned execution');
  const start = vi.spyOn(Runner.prototype, 'start').mockImplementation(
    (request) =>
      ({
        id: randomUUID(),
        platform: request.platform,
        action: request.action,
        ownerId: request.ownerId,
        workflowId: request.workflowId,
        workflowRevision: request.workflowRevision,
        conversationId: request.conversationId,
        state: 'running',
        createdAt: new Date().toISOString(),
      }) satisfies RunSummary,
  );
  const app = buildApp();
  await app.ready();
  return {
    app,
    docs,
    registry,
    record,
    conversation,
    start,
    async stage(request: Partial<RunRequest> = {}) {
      return appendEvent(docs, conversation.id, {
        role: 'assistant',
        kind: 'action',
        status: 'staged',
        action: {
          type: 'run_step',
          stepId: 'action',
          request: {
            platform: plan.platform,
            action: plan.action,
            profileUrl: 'https://x.com/mator_test',
            workflowId: record.id,
            workflowRevision: record.revision,
            ...request,
          },
        },
      });
    },
    confirm(eventId: string) {
      return app.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/stage/${eventId}/confirm`,
        headers: { 'x-utomator-worker-token': 'mator-fixture-token', 'x-owner-id': bob },
      });
    },
    async close() {
      await app.close();
      await docs.close();
    },
  };
}

test('Mator executes the saved graph, parameters and authored step version under the trusted owner', async () => {
  const definitionId = 'mator' + randomUUID().replaceAll('-', '');
  const definitions = new StepDefinitionStore();
  const yaml = [
    'apiVersion: "utomator.dev/v1"',
    'kind: "StepDefinition"',
    'metadata:',
    `  id: "${definitionId}"`,
    '  version: 1',
    '  title: "Pinned note"',
    'spec:',
    '  stepKind: "note"',
    '  operation: "record-event"',
    '  outputs: "status/v1"',
    '  config:',
    '    message: "Saved instruction"',
    '',
  ].join('\n');
  await definitions.create(yaml);
  const base = defaultPlan('x', 'edit-profile');
  const steps = [
    ...base.steps.slice(0, 3),
    {
      id: 'saved-note',
      kind: 'note',
      title: 'Saved note',
      definition: { id: definitionId, version: 1 },
    },
    ...base.steps.slice(3),
  ] as WorkflowPlan['steps'];
  const plan: WorkflowPlan = {
    ...base,
    parameters: { bio: 'Saved profile biography' },
    steps,
    links: steps.slice(1).map((step, index) => ({ source: steps[index].id, target: step.id })),
  };
  const f = await fixture(plan);
  try {
    const event = await f.stage({ ownerId: bob });
    const response = await f.confirm(event.id);
    expect(response.statusCode).toBe(200);
    expect(f.start).toHaveBeenCalledOnce();
    const [request, resolvedDefinitions] = f.start.mock.calls[0];
    expect(request).toMatchObject({
      ownerId: alice,
      workflow: f.record.plan,
      workflowId: f.record.id,
      workflowRevision: 1,
      bio: 'Saved profile biography',
      conversationId: f.conversation.id,
    });
    expect(resolvedDefinitions?.get('saved-note')?.metadata).toMatchObject({
      id: definitionId,
      version: 1,
    });
  } finally {
    await f.close();
    await rm(resolve(process.cwd(), '.runtime', 'step-definitions', definitionId), {
      recursive: true,
      force: true,
    });
  }
});

test('Mator rejects a staged run after its workflow revision changes', async () => {
  const f = await fixture();
  try {
    const event = await f.stage();
    await f.registry.update(f.record.id, 1, { ...f.record.plan, name: 'Changed after proposal' });
    const response = await f.confirm(event.id);
    expect(response.statusCode).toBe(409);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test('Mator cannot run another workflow through the current conversation', async () => {
  const f = await fixture();
  try {
    const other = await f.registry.create(defaultPlan('x', 'audit'));
    const event = await f.stage({ workflowId: other.id });
    expect((await f.confirm(event.id)).statusCode).toBe(400);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test('Mator cannot execute a workflow belonging to another owner', async () => {
  const f = await fixture();
  try {
    const foreign = { ...f.record, ownerId: bob };
    await f.docs.put('workflows', f.record.id, foreign, 1);
    const event = await f.stage();
    expect((await f.confirm(event.id)).statusCode).toBe(400);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test('staging an unversioned Mator run pins its conversation workflow before approval', async () => {
  const f = await fixture();
  try {
    const event = await stageAction(
      f.docs,
      {
        workflows: workflowRegistryPort(f.registry, f.docs),
        runner: { start: f.start },
      },
      {
        workflowId: f.record.id,
        conversationId: f.conversation.id,
        action: {
          type: 'run_step',
          request: {
            platform: 'x',
            action: 'audit',
            profileUrl: 'https://x.com/mator_test',
          },
        },
      },
    );
    expect(event.action).toMatchObject({
      type: 'run_step',
      request: {
        workflowId: f.record.id,
        workflowRevision: f.record.revision,
      },
    });
    await f.registry.update(f.record.id, 1, { ...f.record.plan, name: 'Changed after staging' });
    expect((await f.confirm(event.id)).statusCode).toBe(409);
    expect(f.start).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});
