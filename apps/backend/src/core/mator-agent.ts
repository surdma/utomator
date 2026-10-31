import type { DocumentStore } from '../db/documents.js';
import {
  applyAction,
  assertActionAgainstPlan,
  type MatorAction,
  type MatorActionPorts,
  MatorActionValidationError,
  parseMatorAction,
  stageAction,
} from './mator-actions.js';
import { getAttachmentFile } from './mator-attachments.js';
import {
  appendEvent,
  listEvents,
  MATOR_CONVERSATIONS_NAMESPACE,
  type MatorConversation,
  type MatorEvent,
} from './mator-conversations.js';
import { decryptSecret } from './mator-crypto.js';
import {
  completeMatorTurn,
  describeImage,
  GROQ_OPENAI_BASE_URL,
  MATOR_STATIC_SYSTEM_PROMPT,
  moderateUserText,
} from './mator-groq.js';
import {
  getMatorSettings,
  isGroqKeyConfigured,
  type MatorSettings,
  readEnvGroqApiKey,
} from './mator-settings.js';
import type { WorkflowPlan } from './workflow-plan.js';

export { GROQ_OPENAI_BASE_URL };
export const MAX_MATOR_ACTIONS_PER_TURN = 3;

/** ~60% of an 8k-token window, estimated as chars/4. */
export const MATOR_CONTEXT_CHAR_BUDGET = 19_200;

const LOOP_CAP_EXPLAIN = 'Stopped after 3 actions this turn. Send another message to continue.';

export class MatorConfigError extends Error {
  readonly code = 'MATOR_CONFIG' as const;
  constructor(
    message: string,
    readonly hint = 'Open Settings and add your Groq API key',
  ) {
    super(message);
    this.name = 'MatorConfigError';
  }
}

export type RunMatorTurnInput = {
  conversationId: string;
  userText?: string;
  attachmentIds?: string[];
  idempotencyKey?: string;
};

export type RunMatorTurnOptions = {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

type WorkflowConversationIndex = {
  currentId: string | null;
  items: Array<MatorConversation & { contextSummary?: string | null }>;
};

type GroqTurnPayload = {
  how?: string;
  actions: unknown[];
};

const workflowIndexKey = (workflowId: string) => `workflow:${workflowId}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function estimateChars(text: string): number {
  return text.length;
}

function summarizePlan(plan: WorkflowPlan): string {
  return [
    `workflow ${plan.platform}/${plan.action} — ${plan.name}`,
    ...plan.steps.map((step) => `- ${step.id} (${step.kind}): ${step.title}`),
  ].join('\n');
}

function eventContextLine(event: MatorEvent): string {
  const bits = [`${event.role}/${event.kind}`];
  if (event.status) bits.push(`status=${event.status}`);
  if (event.text) bits.push(event.text);
  if (event.action) bits.push(`action=${JSON.stringify(event.action)}`);
  return bits.join(' ');
}

async function findConversation(
  docs: DocumentStore,
  conversationId: string,
): Promise<{
  workflowId: string;
  conversation: MatorConversation & { contextSummary?: string | null };
}> {
  const records = await docs.list<WorkflowConversationIndex>(MATOR_CONVERSATIONS_NAMESPACE);
  for (const record of records) {
    if (!record.key.startsWith('workflow:')) continue;
    const hit = record.value.items.find((item) => item.id === conversationId);
    if (hit) return { workflowId: hit.workflowId, conversation: hit };
  }
  throw Error('Conversation not found');
}

async function setContextSummary(
  docs: DocumentStore,
  workflowId: string,
  conversationId: string,
  contextSummary: string,
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
        item.id === conversationId ? { ...item, contextSummary, updatedAt: stamp } : item,
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

function buildSlidingContext(
  events: MatorEvent[],
  planSummary: string,
  priorSummary: string | null | undefined,
  attachmentIds: string[] | undefined,
  imageCaptions: string[] = [],
): {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  nextSummary?: string;
} {
  const recent: MatorEvent[] = [];
  let used =
    estimateChars(MATOR_STATIC_SYSTEM_PROMPT) +
    estimateChars(planSummary) +
    estimateChars(priorSummary ?? '');
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    const line = eventContextLine(event);
    const cost = estimateChars(line) + 8;
    if (used + cost > MATOR_CONTEXT_CHAR_BUDGET && recent.length > 0) break;
    recent.unshift(event);
    used += cost;
  }

  const omitted = events.slice(0, events.length - recent.length);
  let nextSummary = priorSummary ?? undefined;
  const dynamicParts = ['Workflow summary:', planSummary];
  if (attachmentIds?.length)
    dynamicParts.push(`Attachment ids in this turn: ${attachmentIds.join(', ')}`);
  if (imageCaptions.length) dynamicParts.push('Vision captions:', ...imageCaptions);
  if (omitted.length) {
    const omittedText = omitted.map(eventContextLine).join('\n');
    nextSummary = [priorSummary, omittedText].filter(Boolean).join('\n').slice(-8_000);
    dynamicParts.push('Earlier conversation summary:', nextSummary);
  } else if (priorSummary) {
    dynamicParts.push('Earlier conversation summary:', priorSummary);
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: MATOR_STATIC_SYSTEM_PROMPT },
    { role: 'user', content: dynamicParts.join('\n') },
    {
      role: 'assistant',
      content: 'Context noted. I will only propose actions against the step ids in that summary.',
    },
  ];
  for (const event of recent) {
    const content = eventContextLine(event);
    if (event.role === 'user') messages.push({ role: 'user', content });
    else messages.push({ role: 'assistant', content });
  }
  return { messages, nextSummary: nextSummary !== priorSummary ? nextSummary : undefined };
}

function parseGroqPayload(content: string): GroqTurnPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Groq returned non-JSON content');
  }
  if (!isPlainObject(raw)) throw new Error('Groq payload must be an object');
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  const how = typeof raw.how === 'string' ? raw.how : undefined;
  return { how, actions };
}

function parseGroqPayloadSafe(content: string): GroqTurnPayload {
  try {
    return parseGroqPayload(content);
  } catch {
    return { actions: [] };
  }
}

export function requireGroqKey(docs: DocumentStore, settings: MatorSettings): string {
  if (isGroqKeyConfigured(settings) && settings.groqKey) {
    return decryptSecret(docs.ownerId, settings.groqKey);
  }
  const fromEnv = readEnvGroqApiKey();
  if (fromEnv) return fromEnv;
  throw new MatorConfigError('Groq API key is not configured');
}

async function persistAction(
  docs: DocumentStore,
  ports: MatorActionPorts,
  settings: MatorSettings,
  input: {
    workflowId: string;
    conversationId: string;
    action: MatorAction;
    text?: string;
  },
): Promise<MatorEvent[]> {
  if (input.action.type === 'clarify') {
    const text = input.text?.trim() || input.action.prompt;
    const event = await appendEvent(docs, input.conversationId, {
      role: 'assistant',
      kind: 'clarify',
      action: input.action,
      ...(text ? { text } : {}),
    });
    return [event];
  }

  const live = await ports.workflows.get(input.workflowId);
  if (!live) throw Error('Workflow not found');
  assertActionAgainstPlan(input.action, live.plan);

  const staged = await stageAction(docs, ports, {
    workflowId: input.workflowId,
    conversationId: input.conversationId,
    action: input.action,
    text: input.text,
  });
  const out: MatorEvent[] = [staged];
  if (settings.autoApprove) {
    const applied = await applyAction(
      docs,
      ports,
      {
        workflowId: input.workflowId,
        conversationId: input.conversationId,
        eventId: staged.id,
        action: input.action,
      },
      { squash: settings.squashPipelineHistory, conversationId: input.conversationId },
    );
    out.push(applied.event);
  }
  return out;
}

export async function runMatorTurn(
  docs: DocumentStore,
  ports: MatorActionPorts,
  input: RunMatorTurnInput,
  options: RunMatorTurnOptions = {},
): Promise<{ events: MatorEvent[] }> {
  const { workflowId, conversation } = await findConversation(docs, input.conversationId);
  const settings = await getMatorSettings(docs);
  const apiKey = requireGroqKey(docs, settings);

  const priorEvents = await listEvents(docs, input.conversationId, {});
  if (input.idempotencyKey) {
    const hit = priorEvents.find((event) => event.idempotencyKey === input.idempotencyKey);
    if (hit) {
      const idx = priorEvents.findIndex((event) => event.id === hit.id);
      return { events: priorEvents.slice(idx) };
    }
  }
  // TODO(mator): turn-level idempotency is event-scoped only — concurrent in-flight
  // duplicates with the same idempotencyKey can both pass this check, share one user
  // event via CAS, then both call Groq. Consider an in-memory lock by idempotencyKey
  // (and eventually per-owner Groq rate limiting).

  const produced: MatorEvent[] = [];
  if (input.userText !== undefined || input.attachmentIds?.length) {
    const userEvent = await appendEvent(
      docs,
      input.conversationId,
      {
        role: 'user',
        kind: 'message',
        ...(input.userText !== undefined ? { text: input.userText } : {}),
        ...(input.attachmentIds?.[0] ? { attachmentId: input.attachmentIds[0] } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    produced.push(userEvent);
  }

  const live = await ports.workflows.get(workflowId);
  if (!live) throw Error('Workflow not found');

  const groqOptions = { fetch: options.fetch, signal: options.signal };
  if (settings.moderationEnabled && input.userText?.trim()) {
    const moderation = await moderateUserText(apiKey, input.userText, groqOptions);
    if (moderation.incomplete) {
      const incomplete = await appendEvent(docs, input.conversationId, {
        role: 'assistant',
        kind: 'message',
        text: 'Response incomplete. Continue to resume.',
        status: 'incomplete',
      });
      produced.push(incomplete);
      return { events: produced };
    }
    if (moderation.degraded) {
      const note = await appendEvent(docs, input.conversationId, {
        role: 'assistant',
        kind: 'message',
        text: `Groq unavailable (${moderation.degraded}). No actions invented — try again or use Settings.`,
        status: 'error',
      });
      produced.push(note);
      return { events: produced };
    }
    if (moderation.violation) {
      const blocked = await appendEvent(docs, input.conversationId, {
        role: 'assistant',
        kind: 'message',
        text: `Blocked by content check${moderation.category ? ` (${moderation.category})` : ''}. ${moderation.rationale ?? 'That request cannot run as a workflow action.'}`,
        status: 'error',
      });
      produced.push(blocked);
      return { events: produced };
    }
  }

  const imageCaptions: string[] = [];
  for (const attachmentId of (input.attachmentIds ?? []).slice(0, 3)) {
    try {
      const loaded = await getAttachmentFile(docs, attachmentId);
      if (!loaded.meta.mime.startsWith('image/') || loaded.bytes.length > 20 * 1024 * 1024) continue;
      const vision = await describeImage(
        apiKey,
        { mime: loaded.meta.mime, base64: loaded.bytes.toString('base64') },
        { ...groqOptions, modelId: settings.visionModelId },
      );
      if (vision.caption) imageCaptions.push(`${attachmentId}: ${vision.caption}`);
    } catch {
      /* missing binaries stay out of the prompt */
    }
  }

  // Newly appended user turn is already in `produced` / history — do not push userText again.
  const history = [...priorEvents, ...produced];
  const { messages, nextSummary } = buildSlidingContext(
    history,
    summarizePlan(live.plan),
    conversation.contextSummary,
    input.attachmentIds,
    imageCaptions,
  );
  if (nextSummary) await setContextSummary(docs, workflowId, input.conversationId, nextSummary);

  const completion = await completeMatorTurn(apiKey, settings.modelId, messages, {
    ...groqOptions,
    reasoningEffort: settings.reasoningEffort,
  });
  const groq = {
    incomplete: completion.incomplete,
    degraded: completion.degraded,
    payload: completion.content
      ? parseGroqPayloadSafe(completion.content)
      : { actions: [] as unknown[] },
  };
  if (!completion.incomplete && !completion.degraded && completion.content) {
    try {
      groq.payload = parseGroqPayload(completion.content);
    } catch {
      groq.incomplete = true;
      groq.payload = parseGroqPayloadSafe(completion.content);
    }
  }

  if (groq.incomplete) {
    const incomplete = await appendEvent(docs, input.conversationId, {
      role: 'assistant',
      kind: 'message',
      text: groq.payload.how?.trim() || 'Response incomplete. Continue to resume.',
      status: 'incomplete',
    });
    produced.push(incomplete);
    return { events: produced };
  }

  if (groq.degraded) {
    const note = await appendEvent(docs, input.conversationId, {
      role: 'assistant',
      kind: 'message',
      text: `Groq unavailable (${groq.degraded}). No actions invented — try again or use Settings.`,
      status: 'error',
    });
    produced.push(note);
    return { events: produced };
  }

  if (groq.payload.how?.trim()) {
    const howEvent = await appendEvent(docs, input.conversationId, {
      role: 'assistant',
      kind: 'how',
      text: groq.payload.how.trim(),
    });
    produced.push(howEvent);
  }

  const rawActions = groq.payload.actions;
  const capped = rawActions.slice(0, MAX_MATOR_ACTIONS_PER_TURN);
  const overflow = rawActions.length > MAX_MATOR_ACTIONS_PER_TURN;

  for (const raw of capped) {
    try {
      const action = parseMatorAction(raw);
      const plan = (await ports.workflows.get(workflowId))?.plan ?? live.plan;
      assertActionAgainstPlan(action, plan);
      const actionEvents = await persistAction(docs, ports, settings, {
        workflowId,
        conversationId: input.conversationId,
        action,
      });
      produced.push(...actionEvents);
    } catch (error) {
      const message =
        error instanceof MatorActionValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Invalid action';
      const errEvent = await appendEvent(docs, input.conversationId, {
        role: 'assistant',
        kind: 'action',
        text: message,
        status: 'error',
        ...(isPlainObject(raw) ? { action: raw } : {}),
      });
      produced.push(errEvent);
    }
  }

  if (overflow) {
    const stopAction: MatorAction = { type: 'explain_how', text: LOOP_CAP_EXPLAIN };
    const stopEvents = await persistAction(docs, ports, settings, {
      workflowId,
      conversationId: input.conversationId,
      action: stopAction,
      text: LOOP_CAP_EXPLAIN,
    });
    produced.push(...stopEvents);
  } else if (!capped.length && !groq.payload.how?.trim()) {
    const noopEvents = await persistAction(docs, ports, settings, {
      workflowId,
      conversationId: input.conversationId,
      action: { type: 'noop', reason: 'No actions from model' },
    });
    produced.push(...noopEvents);
  }

  return { events: produced };
}
