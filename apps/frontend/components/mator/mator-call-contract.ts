import type { MatorCallTurnResult } from './mator-call-coordinator.ts';
import {
  type MatorChatEvent,
  readClarifyQuestions,
} from './mator-chat-state.ts';

/** Only events from the current POST qualify. Never read the latest unrelated thread event. */
export function resolveMatorCallTurn(
  events: MatorChatEvent[],
): MatorCallTurnResult {
  const eventIds = events.map((event) => event.id);
  const assistant = events.filter((event) => event.role === 'assistant');
  const clarify = assistant.find(
    (event) => event.kind === 'clarify' && readClarifyQuestions(event.action),
  );
  const questions = clarify ? readClarifyQuestions(clarify.action) : null;
  const stages = assistant
    .filter((event) => event.status === 'staged')
    .map((event) => event.id);
  const error = assistant.some(
    (event) => event.status === 'incomplete' || event.status === 'error',
  );
  const reply =
    [...assistant]
      .reverse()
      .find(
        (event) =>
          (event.kind === 'message' || event.kind === 'how') &&
          !['error', 'incomplete', 'staged', 'rejected'].includes(
            event.status ?? '',
          ) &&
          Boolean(event.text?.trim()),
      )
      ?.text?.trim() ?? '';
  return {
    reply,
    requiresAttention: Boolean(
      questions?.length || stages.length || error || !reply,
    ),
    eventIds,
    ...(questions?.length && clarify
      ? { clarification: { eventId: clarify.id, questions } }
      : {}),
    ...(stages.length ? { stagedEventIds: stages } : {}),
  };
}
