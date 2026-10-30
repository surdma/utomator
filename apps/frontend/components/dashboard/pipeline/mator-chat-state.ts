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
};

const SEED_TEXT =
  'Say what you want changed. I can audit a profile, change a headline, add a skill, or draft a post.';

export function seedConversation(): MatorChatBubble[] {
  return [{ id: 'seed', sender: 'assistant', text: SEED_TEXT }];
}

export function mergeMatorEvents(
  existing: MatorChatEvent[],
  incoming: MatorChatEvent[],
): MatorChatEvent[] {
  const byId = new Map<string, MatorChatEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function eventsToConversation(
  events: MatorChatEvent[],
  localNotices: MatorChatBubble[] = [],
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

export function findPendingStage(
  events: MatorChatEvent[],
): MatorChatEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.status === 'staged') return events[index]!;
  }
  return null;
}

export function findIncompleteEvent(
  events: MatorChatEvent[],
): MatorChatEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.status === 'incomplete') return events[index]!;
  }
  return null;
}

export function shouldSpeakHow(
  event: MatorChatEvent,
  howTtsEnabled: boolean,
): boolean {
  return (
    howTtsEnabled &&
    event.kind === 'how' &&
    event.role === 'assistant' &&
    Boolean(event.text?.trim())
  );
}

export function pendingStageLabel(event: MatorChatEvent | null): string | null {
  if (!event) return null;
  const action = event.action as { type?: string } | undefined;
  if (action?.type) return action.type.replaceAll('_', ' ');
  return event.text?.trim() || 'staged action';
}
