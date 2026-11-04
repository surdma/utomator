import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAction,
  MatorActionValidationError,
  parseMatorAction,
  parseGeneratedMatorAction,
  restoreConversationPipeline,
  stageAction,
  type MatorActionPorts,
  type MatorWorkflowPort,
} from '../src/mator/mator-actions.js';
import {
  getAttachmentFile,
  getAttachmentMeta,
  saveAttachment,
} from '../src/mator/mator-attachments.js';
import {
  createConversation,
  listConversations,
  listEvents,
  type MatorConversation,
} from '../src/mator/mator-conversations.js';
import { defaultPlan, type WorkflowPlan } from '../src/workflows/workflow-plan.js';
import type { WorkflowRecord } from '../src/workflows/workflow-registry.js';
import type { DocumentRecord, DocumentStore } from '../src/db/documents.js';
import type { RunRequest, RunSummary } from '../src/core/types.js';

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
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: 'local-owner',
    templateId: null,
    revision,
    createdAt: now,
    updatedAt: now,
    plan,
  };
}

function fakeWorkflowPort(initial: TaggedRecord): MatorWorkflowPort & {
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

function portsFor(
  workflow: ReturnType<typeof fakeWorkflowPort>,
  runnerStarts: RunRequest[] = [],
): MatorActionPorts {
  return {
    workflows: workflow,
    runner: {
      start(request) {
        runnerStarts.push(request);
        const summary: RunSummary = {
          id: `run-${runnerStarts.length}`,
          platform: request.platform,
          action: request.action,
          state: 'running',
          createdAt: new Date().toISOString(),
          workflowId: request.workflowId,
          workflowRevision: request.workflowRevision,
        };
        return summary;
      },
    },
    crafts: {
      apply: async () => ({ ok: true }),
    },
  };
}

test('parseMatorAction accepts a clarify questionnaire', () => {
  const action = parseMatorAction({
    type: 'clarify',
    prompt: 'Need a tone',
    questions: [
      {
        name: 'tone',
        prompt: 'Which tone?',
        required: true,
        choices: [
          { value: 'direct', label: 'Direct' },
          { value: 'warm', label: 'Warm' },
        ],
      },
    ],
  });
  assert.equal(action.type, 'clarify');
  if (action.type !== 'clarify') return;
  assert.equal(action.questions[0]?.name, 'tone');
  assert.throws(
    () => parseMatorAction({ type: 'clarify', questions: [] }),
    (error: unknown) => error instanceof MatorActionValidationError,
  );
});

test('generated clarify recovers oversized choice sets without dropping a question', () => {
  const tooMany = Array.from({ length: 7 }, (_, index) => ({
    value: 'option_' + index,
    label: 'Option ' + index,
  }));
  const raw = {
    type: 'clarify',
    prompt: 'Which setting should change?',
    questions: [
      { name: 'setting', prompt: 'Which setting?', required: true, choices: tooMany },
      { name: 'tone', prompt: 'Which tone?', required: false, choices: [
        { value: 'warm', label: 'Warm' }, { value: 'direct', label: 'Direct' },
      ] },
    ],
  };
  assert.throws(
    () => parseMatorAction(raw),
    (error: unknown) => error instanceof MatorActionValidationError &&
      error.message === 'Too many choices on questions[0]',
  );
  const recovered = parseGeneratedMatorAction(raw);
  assert.equal(recovered.type, 'clarify');
  if (recovered.type !== 'clarify') return;
  assert.equal(recovered.questions.length, 2);
  assert.equal(recovered.questions[0]?.prompt, 'Which setting?');
  assert.deepEqual(recovered.questions[0]?.choices, []);
  assert.equal(recovered.questions[0]?.freeform?.label, 'Your answer');
  assert.equal(recovered.questions[0]?.required, true);
  assert.equal(recovered.questions[1]?.choices.length, 2);
  assert.equal(raw.questions[0]?.choices.length, 7, 'model response is not mutated');
});

test('generated clarify recovery cannot bypass invalid action validation', () => {
  assert.throws(() => parseGeneratedMatorAction({
    type: 'clarify',
    questions: [{ name: 'file', prompt: 'Choose a file', inputType: 'file',
      choices: Array.from({ length: 7 }, (_, index) => ({
        value: String(index), label: String(index),
      })),
    }],
  }), MatorActionValidationError);
  assert.throws(() => parseGeneratedMatorAction({
    type: 'delete_everything',
  }), MatorActionValidationError);
  assert.throws(() => parseGeneratedMatorAction({
    type: 'clarify',
    questions: Array.from({ length: 5 }, (_, index) => ({
      name: 'q' + index, prompt: 'Prompt', choices: [
        { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
      ],
    })),
  }), MatorActionValidationError);
});

test('clarify validates URL and file answer types without inventing attachments', () => {
  const action = parseMatorAction({
    type: 'clarify',
    questions: [
      { name: 'source', prompt: 'Which website URL?', inputType: 'url', required: true },
      { name: 'asset', prompt: 'Attach the image', inputType: 'file', required: true },
    ],
  });
  assert.equal(action.type, 'clarify');
  if (action.type !== 'clarify') return;
  assert.deepEqual(action.questions.map((q) => q.inputType), ['url', 'file']);
  assert.throws(() => parseMatorAction({
    type: 'clarify',
    questions: [{ name: 'bad', prompt: 'Invalid', inputType: 'html' }],
  }), MatorActionValidationError);
  assert.throws(() => parseMatorAction({
    type: 'clarify',
    questions: [{ name: 'bad', prompt: 'Invalid', inputType: 'file', choices: [
      { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
    ] }],
  }), MatorActionValidationError);
});

test('parseMatorAction rejects unknown action type and invalid shape', () => {
  assert.throws(
    () => parseMatorAction({ type: 'delete_universe' }),
    (error: unknown) => error instanceof MatorActionValidationError,
  );
  assert.throws(
    () => parseMatorAction({ type: 'edit_step' }),
    (error: unknown) => error instanceof MatorActionValidationError,
  );
});

test('apply/stage reject hallucinated step ids with typed validation error', async () => {
  const docs = new FakeDocuments('local-owner');
  const plan = defaultPlan('x', 'audit');
  const workflow = fakeWorkflowPort(makeRecord(plan));
  const ports = portsFor(workflow);
  const conversation = await createConversation(docs, workflow.live.id, 'Thread');

  const bad = parseMatorAction({
    type: 'edit_step',
    stepId: 'does-not-exist',
    patch: { title: 'Nope' },
  });

  await assert.rejects(
    () =>
      stageAction(docs, ports, {
        workflowId: workflow.live.id,
        conversationId: conversation.id,
        action: bad,
      }),
    (error: unknown) =>
      error instanceof MatorActionValidationError && /does-not-exist|unknown step/i.test(error.message),
  );

  await assert.rejects(
    () =>
      applyAction(
        docs,
        ports,
        {
          workflowId: workflow.live.id,
          conversationId: conversation.id,
          eventId: 'evt-missing-step',
          action: bad,
        },
        { squash: false },
      ),
    (error: unknown) => error instanceof MatorActionValidationError,
  );
});

test('apply edit_step without squash tags revision and updates boundRevisionId', async () => {
  const docs = new FakeDocuments('local-owner');
  const plan = defaultPlan('x', 'audit');
  const workflow = fakeWorkflowPort(makeRecord(plan));
  const ports = portsFor(workflow);
  const conversation = await createConversation(docs, workflow.live.id, 'Edit thread');
  const beforeRevision = workflow.live.revision;

  const action = parseMatorAction({
    type: 'edit_step',
    stepId: 'inspect',
    patch: { title: 'Inspect more carefully' },
  });

  const staged = await stageAction(docs, ports, {
    workflowId: workflow.live.id,
    conversationId: conversation.id,
    action,
  });
  assert.equal(staged.status, 'staged');
  assert.equal(workflow.live.revision, beforeRevision);

  const applied = await applyAction(
    docs,
    ports,
    {
      workflowId: workflow.live.id,
      conversationId: conversation.id,
      eventId: staged.id,
      action,
    },
    { squash: false },
  );

  assert.equal(workflow.live.revision, beforeRevision + 1);
  assert.equal(
    workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title,
    'Inspect more carefully',
  );
  assert.equal(applied.record?.conversationId, conversation.id);
  assert.equal(applied.record?.eventId, staged.id);

  const tagged = workflow.revisions.get(workflow.live.revision);
  assert.equal(tagged?.conversationId, conversation.id);
  assert.equal(tagged?.eventId, staged.id);

  const [updated]: MatorConversation[] = await listConversations(docs, workflow.live.id);
  assert.equal(updated?.boundRevisionId, `${workflow.live.id}:${workflow.live.revision}`);
  assert.equal(applied.event.status, 'applied');
});

test('squash=true updates live plan only without conversation-bound revision trail', async () => {
  const docs = new FakeDocuments('local-owner');
  const plan = defaultPlan('x', 'audit');
  const workflow = fakeWorkflowPort(makeRecord(plan));
  const ports = portsFor(workflow);
  const conversation = await createConversation(docs, workflow.live.id, 'Squash thread');
  const beforeRevision = workflow.live.revision;

  const action = parseMatorAction({
    type: 'edit_step',
    stepId: 'action',
    patch: { title: 'Squashed edit' },
  });

  const result = await applyAction(
    docs,
    ports,
    {
      workflowId: workflow.live.id,
      conversationId: conversation.id,
      eventId: 'evt-squash',
      action,
    },
    { squash: true },
  );

  assert.equal(workflow.live.revision, beforeRevision + 1);
  assert.equal(workflow.live.plan.steps.find((s) => s.id === 'action')?.title, 'Squashed edit');
  assert.equal(result.record?.conversationId, undefined);
  assert.equal(result.record?.eventId, undefined);

  const tagged = workflow.revisions.get(workflow.live.revision);
  assert.equal(tagged?.conversationId, undefined);
  assert.equal(tagged?.eventId, undefined);

  const [updated] = await listConversations(docs, workflow.live.id);
  assert.equal(updated?.boundRevisionId, null);
});

test('restoreConversationPipeline copies bound revision into live via CAS', async () => {
  const docs = new FakeDocuments('local-owner');
  const plan = defaultPlan('x', 'audit');
  const workflow = fakeWorkflowPort(makeRecord(plan));
  const ports = portsFor(workflow);
  const conversation = await createConversation(docs, workflow.live.id, 'Restore thread');

  const firstEdit = parseMatorAction({
    type: 'edit_step',
    stepId: 'inspect',
    patch: { title: 'Bound title' },
  });
  await applyAction(
    docs,
    ports,
    {
      workflowId: workflow.live.id,
      conversationId: conversation.id,
      eventId: 'evt-bound',
      action: firstEdit,
    },
    { squash: false },
  );
  const boundRevision = workflow.live.revision;
  const boundTitle = workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title;

  // Live drifts away (e.g. another editor) without binding to this conversation.
  await workflow.update(workflow.live.id, workflow.live.revision, {
    ...workflow.live.plan,
    steps: workflow.live.plan.steps.map((s) =>
      s.id === 'inspect' ? { ...s, title: 'Live drifted' } : s,
    ),
  });
  assert.notEqual(workflow.live.revision, boundRevision);

  const liveBeforeRestore = workflow.live.revision;
  const restored = await restoreConversationPipeline(
    docs,
    ports.workflows,
    workflow.live.id,
    conversation.id,
  );

  assert.equal(restored.revision, liveBeforeRestore + 1);
  assert.ok(restored.revision > boundRevision);
  assert.equal(workflow.live.plan.steps.find((s) => s.id === 'inspect')?.title, boundTitle);
  assert.equal(restored.plan.steps.find((s) => s.id === 'inspect')?.title, boundTitle);
});

test('run_step invokes injectable runner port', async () => {
  const docs = new FakeDocuments('local-owner');
  const plan = defaultPlan('linkedin', 'audit');
  const workflow = fakeWorkflowPort(makeRecord(plan));
  const started: RunRequest[] = [];
  const ports = portsFor(workflow, started);
  const conversation = await createConversation(docs, workflow.live.id, 'Run thread');

  const action = parseMatorAction({
    type: 'run_step',
    stepId: 'action',
    request: {
      platform: 'linkedin',
      action: 'audit',
      profileUrl: 'https://www.linkedin.com/in/example',
      workflowId: workflow.live.id,
      workflowRevision: workflow.live.revision,
    },
  });

  const result = await applyAction(
    docs,
    ports,
    {
      workflowId: workflow.live.id,
      conversationId: conversation.id,
      eventId: 'evt-run',
      action,
    },
    { squash: true },
  );

  assert.equal(started.length, 1);
  assert.equal(started[0]?.workflowId, workflow.live.id);
  assert.equal(started[0]?.profileUrl, 'https://www.linkedin.com/in/example');
  assert.equal(result.run?.id, 'run-1');
  assert.equal(workflow.live.revision, 1);

  const events = await listEvents(docs, conversation.id, {});
  assert.ok(events.some((e) => e.status === 'applied' && e.kind === 'action'));
});

test('apply annotate_image upserts attachment markers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-annotate-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const plan = defaultPlan('x', 'audit');
    const workflow = fakeWorkflowPort(makeRecord(plan));
    const ports = portsFor(workflow);
    const conversation = await createConversation(docs, workflow.live.id, 'Annotate thread');
    const saved = await saveAttachment(
      docs,
      {
        conversationId: conversation.id,
        filename: 'shot.png',
        mime: 'image/png',
        bytes: Buffer.from('png'),
      },
      { root },
    );

    const action = parseMatorAction({
      type: 'annotate_image',
      attachmentId: saved.id,
      markers: [{ id: 'pin-1', x: 0.25, y: 0.75, text: 'look here' }],
    });

    const result = await applyAction(
      docs,
      ports,
      {
        workflowId: workflow.live.id,
        conversationId: conversation.id,
        eventId: 'evt-annotate',
        action,
      },
      { squash: true },
    );

    assert.equal(result.event.status, 'applied');
    const loaded = await getAttachmentFile(docs, saved.id, { root });
    assert.deepEqual(loaded.meta.markers, [
      { id: 'pin-1', x: 0.25, y: 0.75, text: 'look here' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('annotate_image parses and links optional review references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mator-annotate-review-'));
  try {
    const docs = new FakeDocuments('local-owner');
    const workflow = fakeWorkflowPort(makeRecord(defaultPlan('x', 'audit')));
    const ports = portsFor(workflow);
    const conversation = await createConversation(docs, workflow.live.id, 'Review link');
    const saved = await saveAttachment(docs, {
      conversationId: conversation.id,
      filename: 'shot.png',
      mime: 'image/png',
      bytes: Buffer.from('png'),
    }, { root });
    const reviewId = '123e4567-e89b-42d3-a456-426614174000';

    // A malformed reference never parses into an applicable action.
    assert.throws(
      () => parseMatorAction({
        type: 'annotate_image',
        attachmentId: saved.id,
        markers: [],
        reviewId: '“quote”/inject',
      }),
      /Invalid action\.reviewId/,
    );

    const action = parseMatorAction({
      type: 'annotate_image',
      attachmentId: saved.id,
      markers: [],
      reviewId,
    });
    const result = await applyAction(docs, ports, {
      workflowId: workflow.live.id,
      conversationId: conversation.id,
      eventId: 'evt-review-link',
      action,
    }, { squash: true });
    assert.equal(result.event.status, 'applied');
    const meta = await getAttachmentMeta(docs, saved.id);
    assert.equal(meta.reviewId, reviewId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
