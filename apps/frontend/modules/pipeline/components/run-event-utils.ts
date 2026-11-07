import type { Event as RunEvent } from './run-models';

export function appendRunEvent(
  previous: RunEvent[],
  item: RunEvent,
): RunEvent[] {
  return previous.some((entry) => entry.id === item.id)
    ? previous
    : [...previous, item];
}

export function belongsToRun(event: RunEvent, currentRunId: string | null) {
  return event.runId === currentRunId;
}

export function isPauseOrResume(event: RunEvent) {
  return (
    event.kind === 'status' &&
    (event.message.startsWith('Run paused') ||
      event.message.startsWith('Run resumed'))
  );
}

export function isTerminalRunStatus(event: RunEvent) {
  return (
    event.kind === 'status' &&
    (event.message.startsWith('Run ended:') ||
      event.message.includes('Run finished'))
  );
}

/** Reconcile persisted JSONL and live SSE without foreign or conflicting identities. */
export function reconcileRunJournal(
  previous: RunEvent[],
  archived: RunEvent[],
  runId: string,
): RunEvent[] {
  const values = new Map<number, RunEvent>();
  const conflicts = new Set<number>();
  for (const event of [...previous, ...archived]) {
    if (
      event.runId !== runId ||
      !Number.isSafeInteger(event.id) ||
      event.id < 1
    )
      continue;
    if (conflicts.has(event.id)) continue;
    const earlier = values.get(event.id);
    if (earlier && JSON.stringify(earlier) !== JSON.stringify(event)) {
      values.delete(event.id);
      conflicts.add(event.id);
    } else if (!earlier) {
      values.set(event.id, event);
    }
  }
  return [...values.values()].sort((a, b) => a.id - b.id);
}
