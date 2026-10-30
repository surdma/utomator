import {
  appendEvent,
  listEvents,
  MATOR_CONVERSATIONS_NAMESPACE,
  type MatorConversation,
  type MatorEvent,
} from './mator-conversations.js';
import {
  applyAction,
  assertActionAgainstPlan,
  MatorActionValidationError,
  parseMatorAction,
  stageAction,
  type MatorAction,
  type MatorActionPorts,
} from './mator-actions.js';
import {
  getMatorSettings,
  isGroqKeyConfigured,
  type MatorSettings,
} from './mator-settings.js';
import { decryptSecret } from './mator-crypto.js';
import type { WorkflowPlan } from './workflow-plan.js';
import type { DocumentStore } from '../db/documents.js';

export const GROQ_OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
export const MAX_MATOR_ACTIONS_PER_TURN = 3;

/** ~60% of an 8k-token window, estimated as chars/4. */
export const MATOR_CONTEXT_CHAR_BUDGET = 19_200;

const LOOP_CAP_EXPLAIN =
  'Stopped after 3 actions this turn. Send another message to continue.';

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
): Promise<{ workflowId: string; conversation: MatorConversation & { contextSummary?: string | null } }> {
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
): { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; nextSummary?: string } {
  const systemParts = [
    'You are Mator, an action agent for Utomator workflows.',
    'Reply only with structured JSON matching the schema: optional how text and an actions array.',
    'Only reference step ids that exist in the workflow summary. Prefer explain_how or noop when unsure.',
    'Workflow summary:',
    planSummary,
  ];
  if (attachmentIds?.length) systemParts.push(`Attachment ids in this turn: ${attachmentIds.join(', ')}`);

  const recent: MatorEvent[] = [];
  let used = estimateChars(systemParts.join('\n')) + estimateChars(priorSummary ?? '');
  for (let i = events.length - 1; i >= 0; i--) {
    const line = eventContextLine(events[i]!);
    const cost = estimateChars(line) + 8;
    if (used + cost > MATOR_CONTEXT_CHAR_BUDGET && recent.length > 0) break;
    recent.unshift(events[i]!);
    used += cost;
  }

  const omitted = events.slice(0, events.length - recent.length);
  let nextSummary = priorSummary ?? undefined;
  if (omitted.length) {
    const omittedText = omitted.map(eventContextLine).join('\n');
    nextSummary = [priorSummary, omittedText].filter(Boolean).join('\n').slice(-8_000);
    systemParts.push('Earlier conversation summary:', nextSummary);
  } else if (priorSummary) {
    systemParts.push('Earlier conversation summary:', priorSummary);
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemParts.join('\n') },
  ];
  for (const event of recent) {
    const content = eventContextLine(event);
    if (event.role === 'user') messages.push({ role: 'user', content });
    else messages.push({ role: 'assistant', content });
  }
  return { messages, nextSummary: nextSummary !== priorSummary ? nextSummary : undefined };
}

const ACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    how: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['actions'],
} as const;

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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  );
}

async function callGroq(args: {
  apiKey: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  fetchImpl: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<{ payload: GroqTurnPayload; incomplete: boolean; degraded?: string }> {
  let response: Response;
  try {
    response = await args.fetchImpl(`${GROQ_OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
      },
      signal: args.signal,
      body: JSON.stringify({
        model: args.modelId,
        messages: args.messages,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'mator_turn',
            schema: ACTION_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    if (isAbortError(error) || args.signal?.aborted) {
      return { payload: { actions: [] }, incomplete: true };
    }
    return {
      payload: { actions: [] },
      incomplete: false,
      degraded: error instanceof Error ? error.message : 'Groq request failed',
    };
  }

  if (!response.ok) {
    let detail = `Groq HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) detail = errBody.error.message;
    } catch {
      /* ignore */
    }
    return { payload: { actions: [] }, incomplete: false, degraded: detail };
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  };
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  if (choice?.finish_reason === 'length' || content == null || content === '') {
    return {
      payload: content ? parseGroqPayloadSafe(content) : { actions: [] },
      incomplete: true,
    };
  }
  try {
    return { payload: parseGroqPayload(content), incomplete: false };
  } catch {
    return { payload: { actions: [] }, incomplete: true };
  }
}

function parseGroqPayloadSafe(content: string): GroqTurnPayload {
  try {
    return parseGroqPayload(content);
  } catch {
    return { actions: [] };
  }
}

function requireGroqKey(docs: DocumentStore, settings: MatorSettings): string {
  if (!isGroqKeyConfigured(settings) || !settings.groqKey) {
    throw new MatorConfigError('Groq API key is not configured');
  }
  return decryptSecret(docs.ownerId, settings.groqKey);
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

  const history = [...priorEvents, ...produced];
  const { messages, nextSummary } = buildSlidingContext(
    history,
    summarizePlan(live.plan),
    conversation.contextSummary,
    input.attachmentIds,
  );
  if (nextSummary) await setContextSummary(docs, workflowId, input.conversationId, nextSummary);

  if (input.userText) {
    messages.push({ role: 'user', content: input.userText });
  } else if (input.attachmentIds?.length) {
    messages.push({
      role: 'user',
      content: `Process attachments: ${input.attachmentIds.join(', ')}`,
    });
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const groq = await callGroq({
    apiKey,
    modelId: settings.modelId,
    messages,
    fetchImpl,
    signal: options.signal,
  });

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
