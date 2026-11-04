import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerMatorRoutes } from '../src/mator/mator-routes.js';
import { getAttachmentMeta } from '../src/mator/mator-attachments.js';
import { createConversation, listEvents } from '../src/mator/mator-conversations.js';
import { stageAction, workflowRegistryPort, type MatorActionPorts } from '../src/mator/mator-actions.js';
import { putMatorSettings } from '../src/mator/mator-settings.js';
import { WorkflowRegistry } from '../src/workflows/workflow-registry.js';
import { defaultPlan, type WorkflowPlan } from '../src/workflows/workflow-plan.js';
import type { WorkflowRecord } from '../src/workflows/workflow-registry.js';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';
import type { RunRequest, RunSummary } from '../src/core/types.js';

const MASTER = Buffer.from(createHash('sha256').update('mator-routes-test-master').digest());
const hex = (buffer: Buffer) => buffer.toString('hex');

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

type TaggedRecord = WorkflowRecord & { conversationId?: string; eventId?: string };

function makeRecord(plan: WorkflowPlan, revision = 1, id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'): TaggedRecord {
  const now = new Date().toISOString();
  return {
    id,
    ownerId: 'local-owner',
    templateId: null,
    revision,
    createdAt: now,
    updatedAt: now,
    plan,
  };
}

function fakeWorkflowPort(initial: TaggedRecord): MatorActionPorts['workflows'] & {
  live: TaggedRecord;
  revisions: Map<number, TaggedRecord>;
} {
  const revisions = new Map<number, TaggedRecord>([[initial.revision, structuredClone(initial)]]);
  const port = {
    live: structuredClone(initial),
    revisions,
    async get(workflowId: string) {
      if (workflowId !== port.live.id) return null;
      return structuredClone(port.live);
    },
    async getRevision(workflowId: string, revision: number) {
      if (workflowId !== port.live.id) return null;
      const hit = revisions.get(revision);
      return hit ? structuredClone(hit) : null;
    },
    async update(
      workflowId: string,
      expectedRevision: number,
      plan: WorkflowPlan,
      tags?: { conversationId: string; eventId: string },
    ) {
      if (workflowId !== port.live.id) throw Error('Workflow not found');
      if (port.live.revision !== expectedRevision) throw Error('Version conflict: workflow changed');
      const next: TaggedRecord = {
        ...port.live,
        revision: port.live.revision + 1,
        updatedAt: new Date().toISOString(),
        plan: structuredClone(plan),
        ...(tags
          ? { conversationId: tags.conversationId, eventId: tags.eventId }
          : { conversationId: undefined, eventId: undefined }),
      };
      if (!tags) {
        delete next.conversationId;
        delete next.eventId;
      }
      port.live = next;
      revisions.set(next.revision, structuredClone(next));
      return structuredClone(next);
    },
  };
  return port;
}

function groqJsonResponse(body: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) }, finish_reason: 'stop' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function buildMatorApp(opts: {
  docs: FakeDocuments;
  ports: MatorActionPorts;
  fetch?: typeof fetch;
  attachmentRoot?: string;
  resolveVisualReview?: (reviewId: string) => Promise<unknown>;
}) {
  const app = Fastify({ logger: false });
  registerMatorRoutes(app, {
    getDocuments: () => opts.docs,
    ports: opts.ports,
    fetch: opts.fetch,
    attachmentRoot: opts.attachmentRoot,
    resolveVisualReview: opts.resolveVisualReview,
  });
  await app.ready();
  return app;
}

test('GET settings masks key; PUT never echoes raw groqApiKey', async () => {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const app = await buildMatorApp({ docs, ports });
  try {
    const empty = await app.inject({ method: 'GET', url: '/mator/settings' });
    assert.equal(empty.statusCode, 200);
    assert.equal(empty.json().groqKeyConfigured, false);
    assert.equal(empty.json().keySource, 'none');
    assert.equal(empty.json().autoApprove, false);
    assert.equal(empty.json().squashPipelineHistory, false);
    assert.equal(empty.json().howTtsEnabled, true);
    assert.equal(empty.json().modelName, 'GPT-OSS 20B');
    assert.equal(empty.json().modelTier, 'free');
    assert.match(empty.json().modelLabel, /reasoning/i);
    assert.equal('groqApiKey' in empty.json(), false);
    assert.equal('groqKey' in empty.json(), false);

    const put = await app.inject({
      method: 'PUT',
      url: '/mator/settings',
      payload: { groqApiKey: 'gsk_secret_should_not_echo', autoApprove: true },
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().groqKeyConfigured, true);
    assert.equal(put.json().autoApprove, true);
    assert.equal(JSON.stringify(put.json()).includes('gsk_secret_should_not_echo'), false);

    const get = await app.inject({ method: 'GET', url: '/mator/settings' });
    assert.equal(get.json().groqKeyConfigured, true);
    assert.equal(JSON.stringify(get.json()).includes('gsk_secret_should_not_echo'), false);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});

test('POST messages requires Idempotency-Key; missing Groq key returns 400 with settings hint', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'Msgs');
  const app = await buildMatorApp({ docs, ports });
  try {
    const missingHeader = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/messages`,
      payload: { text: 'hello' },
    });
    assert.equal(missingHeader.statusCode, 400);
    assert.match(missingHeader.json().error, /idempotency/i);

    const missingKey = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/messages`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { text: 'hello' },
    });
    assert.equal(missingKey.statusCode, 400);
    assert.match(missingKey.json().error, /groq|settings/i);
  } finally {
    await app.close();
  }
});

test('idempotent message POST returns same events; stage confirm applies plan edit', async () => {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  await putMatorSettings(docs, { groqApiKey: 'gsk_test_key' }, 0);
  const conversation = await createConversation(docs, workflow.live.id, 'Stage');

  let groqCalls = 0;
  const fetchImpl: typeof fetch = async () => {
    groqCalls += 1;
    return groqJsonResponse({
      how: 'Renaming inspect',
      actions: [
        { type: 'edit_step', stepId: 'inspect', patch: { title: 'Inspect via chat' } },
      ],
    });
  };

  const app = await buildMatorApp({ docs, ports, fetch: fetchImpl });
  try {
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/messages`,
      headers: { 'idempotency-key': key },
      payload: { text: 'rename inspect' },
    });
    assert.equal(first.statusCode, 200);
    const firstEvents = first.json().events as Array<{ id: string; status?: string }>;
    assert.ok(firstEvents.some((e) => e.status === 'staged'));
    assert.equal(
      workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title,
      'Inspect current page',
    );

    const second = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/messages`,
      headers: { 'idempotency-key': key },
      payload: { text: 'rename inspect' },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(groqCalls, 2);
    assert.deepEqual(
      (second.json().events as Array<{ id: string }>).map((e) => e.id),
      firstEvents.map((e) => e.id),
    );

    const staged = firstEvents.find((e) => e.status === 'staged')!;
    const confirm = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/stage/${staged.id}/confirm`,
    });
    assert.equal(confirm.statusCode, 200);
    assert.equal(
      workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title,
      'Inspect via chat',
    );
    assert.ok((confirm.json().event as { status: string }).status === 'applied');
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});

test('POST messages with autoApprove applies action without staged-only outcome', async () => {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  await putMatorSettings(docs, { groqApiKey: 'gsk_auto_key', autoApprove: true }, 0);
  const conversation = await createConversation(docs, workflow.live.id, 'Auto');

  const fetchImpl: typeof fetch = async () =>
    groqJsonResponse({
      how: 'Auto renaming',
      actions: [
        { type: 'edit_step', stepId: 'inspect', patch: { title: 'Inspect auto-applied' } },
      ],
    });

  const app = await buildMatorApp({ docs, ports, fetch: fetchImpl });
  try {
    const settings = await app.inject({ method: 'GET', url: '/mator/settings' });
    assert.equal(settings.json().autoApprove, true);

    const res = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/messages`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { text: 'auto rename inspect' },
    });
    assert.equal(res.statusCode, 200);
    const events = res.json().events as Array<{ status?: string; kind: string }>;
    assert.ok(events.some((e) => e.status === 'applied'), 'expected applied action event');
    assert.ok(
      events.some((e) => e.status === 'staged') && events.some((e) => e.status === 'applied'),
      'autoApprove still records stage then apply audit trail',
    );
    assert.equal(
      workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title,
      'Inspect auto-applied',
    );
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
});

test('switch current conversation does not swap YAML; restore changes plan with confirmDirty', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const a = await createConversation(docs, workflow.live.id, 'A');
  const staged = await stageAction(docs, ports, {
    workflowId: workflow.live.id,
    conversationId: a.id,
    action: {
      type: 'edit_step',
      stepId: 'inspect',
      patch: { title: 'Bound for A' },
    },
  });
  const confirmApp = await buildMatorApp({ docs, ports });
  try {
    const applied = await confirmApp.inject({
      method: 'POST',
      url: `/mator/conversations/${a.id}/stage/${staged.id}/confirm`,
    });
    assert.equal(applied.statusCode, 200);
  } finally {
    await confirmApp.close();
  }
  const boundTitle = workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title;
  assert.equal(boundTitle, 'Bound for A');

  await workflow.update(workflow.live.id, workflow.live.revision, {
    ...workflow.live.plan,
    steps: workflow.live.plan.steps.map((s) =>
      s.id === 'inspect' ? { ...s, title: 'Live drifted' } : s,
    ),
  });

  const b = await createConversation(docs, workflow.live.id, 'B');
  const app = await buildMatorApp({ docs, ports });
  try {
    const switchRes = await app.inject({
      method: 'POST',
      url: `/mator/workflows/${workflow.live.id}/current`,
      payload: { conversationId: a.id },
    });
    assert.equal(switchRes.statusCode, 200);
    assert.equal(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title, 'Live drifted');

    const dirty = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${a.id}/restore-pipeline`,
      payload: {},
    });
    assert.equal(dirty.statusCode, 409);
    assert.match(dirty.json().error, /dirty|confirm/i);
    assert.equal(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title, 'Live drifted');

    const restored = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${a.id}/restore-pipeline`,
      payload: { confirmDirty: true },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title, 'Bound for A');

    // ensure B still exists / switch left plans alone earlier
    const list = await app.inject({
      method: 'GET',
      url: `/mator/workflows/${workflow.live.id}/conversations`,
    });
    assert.equal(list.statusCode, 200);
    const listed = list.json() as {
      currentId: string | null;
      items: Array<{ id: string }>;
    };
    assert.ok(listed.items.some((c) => c.id === b.id));
    assert.equal(listed.currentId, a.id);
  } finally {
    await app.close();
  }
});

test('SSE events stream ends with event: done', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'SSE');
  await stageAction(docs, ports, {
    workflowId: workflow.live.id,
    conversationId: conversation.id,
    action: { type: 'noop', reason: 'ping' },
  });
  const app = await buildMatorApp({ docs, ports });
  try {
    const stream = await app.inject({
      method: 'GET',
      url: `/mator/conversations/${conversation.id}/events/stream`,
    });
    assert.equal(stream.statusCode, 200);
    assert.match(stream.headers['content-type'] || '', /text\/event-stream/);
    assert.match(stream.body, /event: done\b/);
    assert.ok(stream.body.indexOf('event: done') > stream.body.indexOf('data:'));
  } finally {
    await app.close();
  }
});

test('workflowRegistryPort tags land in workflow-revisions via stage confirm', async () => {
  const docs = new FakeDocuments('local-owner');
  const registry = new WorkflowRegistry(join(tmpdir(), `mator-reg-${randomUUID()}`));
  registry.setDocuments(docs);
  const created = await registry.create(defaultPlan('x', 'audit'));
  const ports: MatorActionPorts = {
    workflows: workflowRegistryPort(registry, docs),
    runner: {
      start(request: RunRequest): RunSummary {
        return {
          id: 'run-1',
          platform: request.platform,
          action: request.action,
          state: 'running',
          createdAt: new Date().toISOString(),
        };
      },
    },
  };
  const conversation = await createConversation(docs, created.id, 'Tags');
  const staged = await stageAction(docs, ports, {
    workflowId: created.id,
    conversationId: conversation.id,
    action: {
      type: 'edit_step',
      stepId: 'inspect',
      patch: { title: 'Tagged inspect' },
    },
  });
  const app = await buildMatorApp({ docs, ports });
  try {
    const confirm = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/stage/${staged.id}/confirm`,
    });
    assert.equal(confirm.statusCode, 200);
    const live = await registry.get(created.id);
    assert.ok(live);
    assert.equal(live!.revision, 2);
    const revisionDoc = await docs.get<TaggedRecord>(
      'workflow-revisions',
      `${created.id}:${live!.revision}`,
    );
    assert.ok(revisionDoc);
    assert.equal(revisionDoc!.value.conversationId, conversation.id);
    assert.equal(revisionDoc!.value.eventId, staged.id);
  } finally {
    await app.close();
  }
});

test('attachment upload (base64 JSON) and marker patch', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'Attach');
  const root = await mkdtemp(join(tmpdir(), 'mator-att-'));
  const app = await buildMatorApp({ docs, ports, attachmentRoot: root });
  try {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const upload = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/attachments`,
      payload: {
        filename: 'shot.png',
        mime: 'image/png',
        data: png.toString('base64'),
      },
    });
    assert.equal(upload.statusCode, 201);
    const id = upload.json().id as string;
    assert.ok(id);

    const markers = await app.inject({
      method: 'PATCH',
      url: `/mator/attachments/${id}/markers`,
      payload: {
        markers: [{ id: 'm1', x: 1.5, y: -0.2, text: 'here' }],
      },
    });
    assert.equal(markers.statusCode, 200);
    assert.deepEqual(markers.json().markers, [{ id: 'm1', x: 1, y: 0, text: 'here' }]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('marker patch links, validates and rejects review references', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'Link');
  const root = await mkdtemp(join(tmpdir(), 'mator-link-'));
  const reviewId = '123e4567-e89b-42d3-a456-426614174000';
  const app = await buildMatorApp({
    docs,
    ports,
    attachmentRoot: root,
    resolveVisualReview: (id) => Promise.resolve(id === reviewId),
  });
  try {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const upload = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/attachments`,
      payload: { filename: 'shot.png', mime: 'image/png', data: png.toString('base64') },
    });
    const id = upload.json().id as string;

    // Resolvable reference persists on asset metadata.
    const linked = await app.inject({
      method: 'PATCH',
      url: `/mator/attachments/${id}/markers`,
      payload: { markers: [], reviewId },
    });
    assert.equal(linked.statusCode, 200);
    assert.equal(linked.json().reviewId, reviewId);
    const meta = await getAttachmentMeta(docs, id);
    assert.equal(meta.reviewId, reviewId);

    // Malformed reference is rejected before any write.
    const malformed = await app.inject({
      method: 'PATCH',
      url: `/mator/attachments/${id}/markers`,
      payload: { markers: [], reviewId: '../etc/passwd' },
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().error, 'Invalid review reference');

    // Missing review YAML means there is no fabricated link.
    const missing = await app.inject({
      method: 'PATCH',
      url: `/mator/attachments/${id}/markers`,
      payload: {
        markers: [],
        reviewId: '00000000-0000-4000-8000-000000000000',
      },
    });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error, 'Review does not exist');
    const unchanged = await getAttachmentMeta(docs, id);
    assert.equal(unchanged.reviewId, reviewId);

    // Regression: the pre-link contract stays identical.
    const plain = await app.inject({
      method: 'PATCH',
      url: `/mator/attachments/${id}/markers`,
      payload: { markers: [{ id: 'm1', x: 0.5, y: 0.5, text: 'note' }] },
    });
    assert.equal(plain.statusCode, 200);
    assert.deepEqual(plain.json().markers, [{ id: 'm1', x: 0.5, y: 0.5, text: 'note' }]);
    assert.equal(plain.json().reviewId, reviewId);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('list events returns persisted conversation events', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'List');
  await stageAction(docs, ports, {
    workflowId: workflow.live.id,
    conversationId: conversation.id,
    action: { type: 'noop' },
  });
  const app = await buildMatorApp({ docs, ports });
  try {
    const res = await app.inject({
      method: 'GET',
      url: `/mator/conversations/${conversation.id}/events`,
    });
    assert.equal(res.statusCode, 200);
    const events = res.json() as unknown[];
    assert.equal(events.length, (await listEvents(docs, conversation.id, {})).length);
  } finally {
    await app.close();
  }
});

test('two staged decisions are bound to their own proposal and cannot be repeated', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports: MatorActionPorts = {
    workflows: workflow,
    runner: { start: () => ({ id: 'r', platform: 'x', action: 'audit', state: 'running', createdAt: '' }) },
  };
  const conversation = await createConversation(docs, workflow.live.id, 'Independent stages');
  const first = await stageAction(docs, ports, {
    workflowId: workflow.live.id, conversationId: conversation.id,
    action: { type: 'edit_step', stepId: 'inspect', patch: { title: 'First proposed edit' } },
  });
  const second = await stageAction(docs, ports, {
    workflowId: workflow.live.id, conversationId: conversation.id,
    action: { type: 'edit_step', stepId: 'inspect', patch: { title: 'Second proposed edit' } },
  });
  const app = await buildMatorApp({ docs, ports });
  try {
    const rejectFirst = await app.inject({
      method: 'POST', url: `/mator/conversations/${conversation.id}/stage/${first.id}/reject`,
    });
    assert.equal(rejectFirst.statusCode, 200);
    assert.equal(rejectFirst.json().event.resolvesEventId, first.id);
    assert.equal(rejectFirst.json().event.status, 'rejected');
    const confirmSecond = await app.inject({
      method: 'POST', url: `/mator/conversations/${conversation.id}/stage/${second.id}/confirm`,
    });
    assert.equal(confirmSecond.statusCode, 200);
    assert.equal(confirmSecond.json().event.resolvesEventId, second.id);
    assert.equal(confirmSecond.json().event.status, 'applied');
    assert.equal(
      workflow.live.plan.steps.find((step) => step.id === 'inspect')?.title,
      'Second proposed edit',
    );
    const repeated = await app.inject({
      method: 'POST', url: `/mator/conversations/${conversation.id}/stage/${second.id}/confirm`,
    });
    assert.equal(repeated.statusCode, 409);
    const persisted = await listEvents(docs, conversation.id, {});
    assert.equal(persisted.filter((event) => event.resolvesEventId === first.id).length, 1);
    assert.equal(persisted.filter((event) => event.resolvesEventId === second.id).length, 1);
  } finally {
    await app.close();
  }
});
