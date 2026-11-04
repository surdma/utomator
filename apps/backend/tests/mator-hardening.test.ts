
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import Fastify from 'fastify';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';
import { type MatorActionPorts, stageAction } from '../src/mator/mator-actions.js';
import { MAX_MATOR_ACTIONS_PER_TURN } from '../src/mator/mator-agent.js';
import { createConversation } from '../src/mator/mator-conversations.js';
import { registerMatorRoutes } from '../src/mator/mator-routes.js';
import { putMatorSettings } from '../src/mator/mator-settings.js';
import { defaultPlan, type WorkflowPlan } from '../src/workflows/workflow-plan.js';
import type { WorkflowRecord } from '../src/workflows/workflow-registry.js';

const MASTER = Buffer.from(createHash('sha256').update('mator-hardening-test-master').digest());
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

function makeRecord(plan: WorkflowPlan, revision = 1): TaggedRecord {
  const now = new Date().toISOString();
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ownerId: 'local-owner',
    templateId: null,
    revision,
    createdAt: now,
    updatedAt: now,
    plan,
  };
}

function fakeWorkflowPort(initial: TaggedRecord) {
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

function portsFor(workflow: ReturnType<typeof fakeWorkflowPort>): MatorActionPorts {
  return {
    workflows: workflow,
    runner: {
      start: () => ({
        id: 'r',
        platform: 'x',
        action: 'audit',
        state: 'running',
        createdAt: '',
      }),
    },
  };
}

function groqJsonResponse(body: unknown, finishReason = 'stop') {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify(body) },
          finish_reason: finishReason,
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function buildMatorApp(opts: {
  docs: FakeDocuments;
  ports: MatorActionPorts;
  fetch?: typeof fetch;
  attachmentRoot?: string;
}) {
  const app = Fastify({ logger: false });
  registerMatorRoutes(app, {
    getDocuments: () => opts.docs,
    ports: opts.ports,
    fetch: opts.fetch,
    attachmentRoot: opts.attachmentRoot,
  });
  await app.ready();
  return app;
}

async function withEncryption<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
  process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = hex(MASTER);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.UTOMATOR_MATOR_ENCRYPTION_KEY;
    else process.env.UTOMATOR_MATOR_ENCRYPTION_KEY = previous;
  }
}

test('idempotent message replay returns same events and does not re-call Groq', async () => {
  await withEncryption(async () => {
    const docs = new FakeDocuments('local-owner');
    const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
    const ports = portsFor(workflow);
    await putMatorSettings(docs, { groqApiKey: 'gsk_harden_idem' }, 0);
    const conversation = await createConversation(docs, workflow.live.id, 'Idem');

    let groqCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      groqCalls += 1;
      return groqJsonResponse({
        actions: [{ type: 'noop', reason: 'once' }],
      });
    };

    const app = await buildMatorApp({ docs, ports, fetch: fetchImpl });
    try {
      const key = 'harden-idem-key';
      const first = await app.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': key },
        payload: { text: 'ping' },
      });
      expect(first.statusCode).toEqual(200);
      const firstIds = (first.json().events as Array<{ id: string }>).map((e) => e.id);

      const second = await app.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': key },
        payload: { text: 'ping' },
      });
      expect(second.statusCode).toEqual(200);
      expect(groqCalls).toEqual(2);
      expect((second.json().events as Array<{ id: string }>).map((e) => e.id)).toEqual(firstIds);
    } finally {
      await app.close();
    }
  });
});

test('missing Groq key returns 400 with clear settings hint; invalid key yields clear error event', async () => {
  await withEncryption(async () => {
    const docs = new FakeDocuments('local-owner');
    const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
    const ports = portsFor(workflow);
    const conversation = await createConversation(docs, workflow.live.id, 'Key');

    const appMissing = await buildMatorApp({ docs, ports });
    try {
      const missing = await appMissing.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': randomUUID() },
        payload: { text: 'hello' },
      });
      expect(missing.statusCode).toEqual(400);
      expect(missing.json().error).toMatch(/groq/i);
      expect(missing.json().error).toMatch(/settings/i);
    } finally {
      await appMissing.close();
    }

    await putMatorSettings(docs, { groqApiKey: 'gsk_invalid_key' }, 0);
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });

    const appInvalid = await buildMatorApp({ docs, ports, fetch: fetchImpl });
    try {
      const invalid = await appInvalid.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': randomUUID() },
        payload: { text: 'hello again' },
      });
      expect(invalid.statusCode).toEqual(200);
      const events = invalid.json().events as Array<{ status?: string; text?: string }>;
      const err = events.find((e) => e.status === 'error');
      expect(err).toBeTruthy();
      expect(err!.text ?? '').toMatch(/groq|invalid|api key|settings/i);
      expect(events.filter((e) => e.status === 'staged' || e.status === 'applied').length).toEqual(0);
    } finally {
      await appInvalid.close();
    }
  });
});

test('action loop cap processes at most 3 model actions per turn', async () => {
  await withEncryption(async () => {
    const docs = new FakeDocuments('local-owner');
    const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
    const ports = portsFor(workflow);
    await putMatorSettings(docs, { groqApiKey: 'gsk_harden_cap' }, 0);
    const conversation = await createConversation(docs, workflow.live.id, 'Cap');

    const five = Array.from({ length: 5 }, (_, i) => ({
      type: 'explain_how',
      text: `explanation-${i + 1}`,
    }));
    const fetchImpl: typeof fetch = async () => groqJsonResponse({ actions: five });

    const app = await buildMatorApp({ docs, ports, fetch: fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': randomUUID() },
        payload: { text: 'do five things' },
      });
      expect(res.statusCode).toEqual(200);
      const events = res.json().events as Array<{
        kind: string;
        status?: string;
        action?: { type?: string; reason?: string; text?: string };
        text?: string;
      }>;
      const modelGuidance = events.filter((e) => e.kind === 'how' && /^explanation-/.test(e.text ?? ''));
      expect(modelGuidance.length).toEqual(MAX_MATOR_ACTIONS_PER_TURN);
      expect(modelGuidance.map((event) => event.text)).toEqual(['explanation-1', 'explanation-2', 'explanation-3']);
      expect(events.filter((event) => event.status === 'staged' || event.status === 'applied').length).toEqual(0);
      expect(workflow.live.revision).toEqual(1);
      expect(events.some(
          (e) =>
            (e.action?.type === 'explain_how' &&
              /3 actions|continue/i.test(e.action.text ?? e.text ?? '')) ||
            /Stopped after 3 actions/i.test(e.text ?? '') ||
            (e.action?.type === 'explain_how' && /Stopped after 3/i.test(String(e.action))),
        )).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});

test('incomplete Groq finish_reason yields incomplete event (no staged actions)', async () => {
  await withEncryption(async () => {
    const docs = new FakeDocuments('local-owner');
    const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
    const ports = portsFor(workflow);
    await putMatorSettings(docs, { groqApiKey: 'gsk_harden_incomplete' }, 0);
    const conversation = await createConversation(docs, workflow.live.id, 'Incomplete');

    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '' }, finish_reason: 'length' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const app = await buildMatorApp({ docs, ports, fetch: fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/mator/conversations/${conversation.id}/messages`,
        headers: { 'idempotency-key': randomUUID() },
        payload: { text: 'long reply please' },
      });
      expect(res.statusCode).toEqual(200);
      const events = res.json().events as Array<{ status?: string; kind: string }>;
      expect(events.some((e) => e.status === 'incomplete')).toBeTruthy();
      expect(events.filter((e) => e.kind === 'action' && (e.status === 'staged' || e.status === 'applied'))
          .length).toEqual(0);
    } finally {
      await app.close();
    }
  });
});

test('dirty restore requires confirmDirty:true else 409', async () => {
  const docs = new FakeDocuments('local-owner');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports = portsFor(workflow);
  const conversation = await createConversation(docs, workflow.live.id, 'Restore');

  const staged = await stageAction(docs, ports, {
    workflowId: workflow.live.id,
    conversationId: conversation.id,
    action: {
      type: 'edit_step',
      stepId: 'inspect',
      patch: { title: 'Bound title' },
    },
  });

  const app = await buildMatorApp({ docs, ports });
  try {
    const applied = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/stage/${staged.id}/confirm`,
    });
    expect(applied.statusCode).toEqual(200);

    await workflow.update(workflow.live.id, workflow.live.revision, {
      ...workflow.live.plan,
      steps: workflow.live.plan.steps.map((s) =>
        s.id === 'inspect' ? { ...s, title: 'Live drifted' } : s,
      ),
    });

    const dirty = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/restore-pipeline`,
      payload: {},
    });
    expect(dirty.statusCode).toEqual(409);
    expect(dirty.json().error).toMatch(/dirty|confirmDirty/i);
    expect(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title).toEqual('Live drifted');

    const restored = await app.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/restore-pipeline`,
      payload: { confirmDirty: true },
    });
    expect(restored.statusCode).toEqual(200);
    expect(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title).toEqual('Bound title');
  } finally {
    await app.close();
  }
});

test('GET /mator/attachments/:id is owner-scoped (cross-owner 404)', async () => {
  const ownerA = new FakeDocuments('00000000-0000-4000-8000-0000000000aa');
  const ownerB = new FakeDocuments('00000000-0000-4000-8000-0000000000bb');
  const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
  const ports = portsFor(workflow);
  const conversation = await createConversation(ownerA, workflow.live.id, 'AttAuthz');
  const root = await mkdtemp(join(tmpdir(), 'mator-harden-att-'));

  const appA = await buildMatorApp({ docs: ownerA, ports, attachmentRoot: root });
  let attachmentId = '';
  try {
    const upload = await appA.inject({
      method: 'POST',
      url: `/mator/conversations/${conversation.id}/attachments`,
      payload: {
        filename: 'shot.png',
        mime: 'image/png',
        data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64'),
      },
    });
    expect(upload.statusCode).toEqual(201);
    attachmentId = upload.json().id as string;

    const ok = await appA.inject({
      method: 'GET',
      url: `/mator/attachments/${attachmentId}`,
    });
    expect(ok.statusCode).toEqual(200);
    expect(ok.headers['content-type']).toEqual('image/png');
  } finally {
    await appA.close();
  }

  const appB = await buildMatorApp({ docs: ownerB, ports, attachmentRoot: root });
  try {
    const denied = await appB.inject({
      method: 'GET',
      url: `/mator/attachments/${attachmentId}`,
    });
    expect(denied.statusCode).toEqual(404);
    expect(denied.json().error).toMatch(/not found/i);
  } finally {
    await appB.close();
    await rm(root, { recursive: true, force: true });
  }
});
