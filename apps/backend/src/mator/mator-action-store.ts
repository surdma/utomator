import type { RunRequest, RunSummary } from '../core/types.js';
import type { DocumentStore } from '../db/documents.js';
import type { WorkflowPlan, WorkflowStep } from '../workflows/workflow-plan.js';
import { validatePlan } from '../workflows/workflow-plan.js';
import type { WorkflowRecord } from '../workflows/workflow-registry.js';
import {
  assertActionAgainstPlan,
  type MatorAction,
  type MatorActionPorts,
  type MatorRunnerPort,
  type MatorWorkflowPort,
  parseRevisionId,
  revisionIdFor,
  type TaggedWorkflowRecord,
} from './mator-action-parser.js';
import { upsertMarkers } from './mator-attachments.js';
import {
  appendEvent,
  listConversations,
  MATOR_CONVERSATIONS_NAMESPACE,
  setConversationRunId,
  type MatorConversation,
  type MatorEvent,
  type WorkflowConversationIndex,
  workflowIndexKey,
} from './mator-conversations.js';
import { MatorActionValidationError } from './mator-utils.js';

function rebuildLinks(steps: WorkflowStep[]): WorkflowPlan['links'] {
  return steps.slice(1).map((step, index) => ({
    source: steps[index]!.id,
    target: step.id,
  }));
}

function applyPlanMutation(plan: WorkflowPlan, action: MatorAction): WorkflowPlan {
  assertActionAgainstPlan(action, plan);
  let next: WorkflowPlan;
  switch (action.type) {
    case 'edit_step': {
      next = {
        ...plan,
        steps: plan.steps.map((step) =>
          step.id === action.stepId ? { ...step, ...action.patch, id: step.id } : step,
        ),
        links: [...plan.links],
      };
      break;
    }
    case 'add_step': {
      const steps = [...plan.steps];
      const insertAt = action.afterStepId
        ? steps.findIndex((step) => step.id === action.afterStepId) + 1
        : steps.length - 1;
      const at = insertAt <= 0 ? steps.length - 1 : insertAt;
      steps.splice(at, 0, action.step);
      next = { ...plan, steps, links: rebuildLinks(steps) };
      break;
    }
    case 'remove_step': {
      if (['start', 'session', 'action', 'finish'].includes(action.stepId))
        throw new MatorActionValidationError(`Cannot remove required step: ${action.stepId}`, 'stepId');
      const steps = plan.steps.filter((step) => step.id !== action.stepId);
      next = { ...plan, steps, links: rebuildLinks(steps) };
      break;
    }
    default:
      return plan;
  }
  return validatePlan(next, next.platform, next.action);
}

async function setBoundRevisionId(
  docs: DocumentStore,
  workflowId: string,
  conversationId: string,
  boundRevisionId: string | null,
): Promise<void> {
  for (;;) {
    const key = workflowIndexKey(workflowId);
    const record = await docs.get<WorkflowConversationIndex>(MATOR_CONVERSATIONS_NAMESPACE, key);
    const value = record?.value ?? { currentId: null, items: [] };
    if (!value.items.some((item) => item.id === conversationId))
      throw Error('Conversation not found for workflow');
    const stamp = new Date().toISOString();
    const next: WorkflowConversationIndex = {
      ...value,
      items: value.items.map((item) =>
        item.id === conversationId ? { ...item, boundRevisionId, updatedAt: stamp } : item,
      ),
    };
    try {
      await docs.put(MATOR_CONVERSATIONS_NAMESPACE, key, next, record?.version ?? 0);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !/changed/i.test(error.message)) throw error;
    }
  }
}

async function loadConversation(
  docs: DocumentStore,
  workflowId: string,
  conversationId: string,
): Promise<MatorConversation> {
  const conversations = await listConversations(docs, workflowId);
  const hit = conversations.find((item) => item.id === conversationId);
  if (!hit) throw Error('Conversation not found for workflow');
  return hit;
}

export async function stageAction(
  docs: DocumentStore,
  ports: MatorActionPorts,
  input: {
    workflowId: string;
    conversationId: string;
    action: MatorAction;
    text?: string;
  },
): Promise<MatorEvent> {
  const live = await ports.workflows.get(input.workflowId);
  if (!live) throw Error('Workflow not found');
  assertActionAgainstPlan(input.action, live.plan);
  return appendEvent(docs, input.conversationId, {
    role: 'assistant',
    kind: 'action',
    action: input.action,
    status: 'staged',
    ...(input.text ? { text: input.text } : {}),
  });
}

export type ApplyActionResult = {
  record?: TaggedWorkflowRecord;
  run?: RunSummary;
  craftResult?: unknown;
  event: MatorEvent;
};

export async function applyAction(
  docs: DocumentStore,
  ports: MatorActionPorts,
  input: {
    workflowId: string;
    conversationId: string;
    eventId: string;
    action: MatorAction;
  },
  opts: { squash: boolean; conversationId?: string },
): Promise<ApplyActionResult> {
  const conversationId = opts.conversationId ?? input.conversationId;
  const live = await ports.workflows.get(input.workflowId);
  if (!live) throw Error('Workflow not found');
  assertActionAgainstPlan(input.action, live.plan);

  let record: TaggedWorkflowRecord | undefined;
  let run: RunSummary | undefined;
  let craftResult: unknown;

  switch (input.action.type) {
    case 'edit_step':
    case 'add_step':
    case 'remove_step': {
      const nextPlan = applyPlanMutation(live.plan, input.action);
      const tags = opts.squash ? undefined : { conversationId, eventId: input.eventId };
      record = await ports.workflows.update(input.workflowId, live.revision, nextPlan, tags);
      if (!opts.squash && record)
        await setBoundRevisionId(
          docs,
          input.workflowId,
          conversationId,
          revisionIdFor(record.id, record.revision),
        );
      break;
    }
    case 'run_step': {
      run = await ports.runner.start({
        ...input.action.request,
        conversationId: input.conversationId,
      });
      // Persist the conversation↔run-attempt binding so switching
      // conversations or reloading restores the exact pipeline attempt.
      if (run?.id)
        await setConversationRunId(
          docs,
          input.workflowId,
          conversationId,
          run.id,
        );
      break;
    }
    case 'craft': {
      if (!ports.crafts) throw new MatorActionValidationError('Craft port is not configured', 'type');
      craftResult = await ports.crafts.apply(input.action);
      break;
    }
    case 'annotate_image': {
      await upsertMarkers(docs, input.action.attachmentId, input.action.markers, input.action.reviewId);
      break;
    }
    case 'explain_how':
    case 'noop':
    case 'clarify':
      break;
  }

  const event = await appendEvent(docs, conversationId, {
    role: 'assistant',
    kind: 'action',
    action: input.action,
    status: 'applied',
    resolvesEventId: input.eventId,
  });

  return { record, run, craftResult, event };
}

/** Copies the conversation's bound revision into the live plan via CAS. Never auto-runs on switch. */
export async function restoreConversationPipeline(
  docs: DocumentStore,
  workflows: MatorWorkflowPort,
  workflowId: string,
  conversationId: string,
): Promise<TaggedWorkflowRecord> {
  const conversation = await loadConversation(docs, workflowId, conversationId);
  if (!conversation.boundRevisionId)
    throw new MatorActionValidationError(
      'Conversation has no bound pipeline revision',
      'boundRevisionId',
    );
  const { workflowId: boundWorkflowId, revision } = parseRevisionId(conversation.boundRevisionId);
  if (boundWorkflowId !== workflowId)
    throw new MatorActionValidationError('boundRevisionId workflow mismatch', 'boundRevisionId');

  const snapshot = await workflows.getRevision(workflowId, revision);
  if (!snapshot)
    throw new MatorActionValidationError(
      `Bound revision not found: ${conversation.boundRevisionId}`,
      'boundRevisionId',
    );

  const live = await workflows.get(workflowId);
  if (!live) throw Error('Workflow not found');

  return workflows.update(workflowId, live.revision, snapshot.plan);
}

/** Adapter: WorkflowRegistry → MatorWorkflowPort (optional tags written onto revision docs). */
export function workflowRegistryPort(
  registry: {
    get(id: string, revision?: number): Promise<WorkflowRecord | null>;
    update(id: string, expectedRevision: number, raw: unknown): Promise<WorkflowRecord>;
  },
  docs?: DocumentStore,
): MatorWorkflowPort {
  return {
    async get(workflowId) {
      return registry.get(workflowId);
    },
    async getRevision(workflowId, revision) {
      return registry.get(workflowId, revision);
    },
    async update(workflowId, expectedRevision, plan, tags) {
      const record = await registry.update(workflowId, expectedRevision, plan);
      if (!tags || !docs) return record;
      const key = `${record.id}:${record.revision}`;
      const existing = await docs.get<TaggedWorkflowRecord>('workflow-revisions', key);
      if (!existing) return { ...record, ...tags };
      const tagged: TaggedWorkflowRecord = {
        ...existing.value,
        conversationId: tags.conversationId,
        eventId: tags.eventId,
      };
      await docs.put('workflow-revisions', key, tagged, existing.version);
      return tagged;
    },
  };
}
