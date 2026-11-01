export type MatorConversationSummary = {
  id: string;
  workflowId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  boundRevisionId: string | null;
};

export type MatorChatEvent = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  kind: string;
  text?: string;
  action?: unknown;
  attachmentId?: string;
  markers?: Array<{ id: string; x: number; y: number; text: string }>;
  status?: 'staged' | 'applied' | 'rejected' | 'incomplete' | 'error';
  idempotencyKey?: string;
  resolvesEventId?: string;
  createdAt: string;
};

export type MatorChatBubble = {
  id: string | number;
  sender: 'user' | 'assistant';
  text: string;
};

export type MatorSettingsToggles = {
  autoApprove: boolean;
  squashPipelineHistory: boolean;
  howTtsEnabled: boolean;
  modelId?: string;
  modelName?: string;
  modelLabel?: string;
  modelTier?: 'free' | 'paid';
};

const SEED_TEXT =
  'Message this thread. I can audit a profile, change a headline, add a skill, or draft a post.';

export function seedConversation(): MatorChatBubble[] {
  return [{ id: 'seed', sender: 'assistant', text: SEED_TEXT }];
}

export function mergeMatorEvents(
  existing: MatorChatEvent[],
  incoming: MatorChatEvent[]
): MatorChatEvent[] {
  const byId = new Map<string, MatorChatEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function eventsToConversation(
  events: MatorChatEvent[],
  localNotices: MatorChatBubble[] = []
): MatorChatBubble[] {
  const fromEvents: MatorChatBubble[] = [];
  for (const event of events) {
    if (!event.text?.trim()) continue;
    if (event.role === 'user' && event.kind === 'message') {
      fromEvents.push({ id: event.id, sender: 'user', text: event.text });
      continue;
    }
    if (
      event.role === 'assistant' &&
      (event.kind === 'message' || event.kind === 'how')
    ) {
      fromEvents.push({ id: event.id, sender: 'assistant', text: event.text });
    }
  }
  const bubbles =
    fromEvents.length > 0 || localNotices.length > 0
      ? [...fromEvents, ...localNotices]
      : seedConversation();
  return bubbles;
}

/**
 * Resolve one specific proposal. New events carry an exact reference; old
 * unlinked records can only resolve the most recently staged proposal,
 * never every earlier proposal in the conversation.
 */
export function stageResolution(
  events: MatorChatEvent[],
  stagedId: string
): 'applied' | 'rejected' | null {
  const stagedAt = events.findIndex(
    (event) => event.id === stagedId && event.status === 'staged'
  );
  if (stagedAt < 0) return null;
  for (let index = stagedAt + 1; index < events.length; index += 1) {
    const candidate = events[index];
    if (candidate.status !== 'applied' && candidate.status !== 'rejected') continue;
    if (candidate.resolvesEventId) {
      if (candidate.resolvesEventId === stagedId) return candidate.status;
      continue;
    }
    // Backward compatibility for histories saved before resolvesEventId existed.
    const latestStage = events.slice(0, index).reverse().find(
      (event) => event.status === 'staged'
    );
    if (latestStage?.id === stagedId) return candidate.status;
  }
  return null;
}

function isAssistantTerminal(event: MatorChatEvent): boolean {
  if (event.role !== 'assistant') return false;
  if (
    event.status === 'incomplete' ||
    event.status === 'applied' ||
    event.status === 'rejected' ||
    event.status === 'error' ||
    event.status === 'staged'
  ) {
    return true;
  }
  return event.kind === 'message' || event.kind === 'how';
}

/** Latest staged with no later applied/rejected resolution for that stage. */
export function findPendingStage(
  events: MatorChatEvent[]
): MatorChatEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.status !== 'staged') continue;
    if (!stageResolution(events, event.id)) return event;
  }
  return null;
}

/** Incomplete only when it is the latest assistant terminal event. */
export function findIncompleteEvent(
  events: MatorChatEvent[]
): MatorChatEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || !isAssistantTerminal(event)) continue;
    return event.status === 'incomplete' ? event : null;
  }
  return null;
}

export function shouldSpeakHow(
  event: MatorChatEvent,
  howTtsEnabled: boolean
): boolean {
  return (
    howTtsEnabled &&
    event.kind === 'how' &&
    event.role === 'assistant' &&
    Boolean(event.text?.trim())
  );
}

export type MatorClarifyChoice = {
  value: string;
  label: string;
  description?: string;
};

export type MatorClarifyQuestion = {
  name: string;
  prompt: string;
  description?: string;
  required: boolean;
  multiple: boolean;
  choices: MatorClarifyChoice[];
  freeformLabel?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readClarifyQuestions(
  action: unknown
): MatorClarifyQuestion[] | null {
  if (!isRecord(action) || action.type !== 'clarify') return null;
  if (!Array.isArray(action.questions) || action.questions.length === 0)
    return null;
  const questions: MatorClarifyQuestion[] = [];
  for (const item of action.questions) {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      typeof item.prompt !== 'string'
    )
      return null;
    const choices: MatorClarifyChoice[] = [];
    if (Array.isArray(item.choices)) {
      for (const choice of item.choices) {
        if (
          !isRecord(choice) ||
          typeof choice.value !== 'string' ||
          typeof choice.label !== 'string'
        )
          return null;
        choices.push({
          value: choice.value,
          label: choice.label,
          ...(typeof choice.description === 'string'
            ? { description: choice.description }
            : {}),
        });
      }
    }
    const freeformLabel =
      isRecord(item.freeform) && typeof item.freeform.label === 'string'
        ? item.freeform.label
        : typeof item.freeformLabel === 'string'
          ? item.freeformLabel
          : undefined;
    questions.push({
      name: item.name,
      prompt: item.prompt,
      required: item.required === true,
      multiple: item.multiple === true,
      choices,
      ...(typeof item.description === 'string'
        ? { description: item.description }
        : {}),
      ...(freeformLabel ? { freeformLabel } : {}),
    });
  }
  return questions;
}

/** Latest clarify that the user has not answered yet. */
export function findOpenClarify(
  events: MatorChatEvent[]
): MatorChatEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.role === 'user') return null;
    if (event.kind === 'clarify' && readClarifyQuestions(event.action))
      return event;
  }
  return null;
}

export function formatClarifyReply(
  questions: MatorClarifyQuestion[],
  formData: FormData
): string {
  return questions
    .map((question) => {
      const values = formData
        .getAll(question.name)
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean);
      const answer = values.length > 0 ? values.join(', ') : 'Skipped';
      return `${question.prompt} ${answer}`;
    })
    .join('\n');
}

export function pendingStageLabel(event: MatorChatEvent | null): string | null {
  if (!event) return null;
  const action = event.action as { type?: string } | undefined;
  if (action?.type) return action.type.replaceAll('_', ' ');
  return event.text?.trim() || 'staged action';
}
