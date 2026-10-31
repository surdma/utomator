import type { Event as RunEvent } from './run-models';

export function appendRunEvent(
  previous: RunEvent[],
  item: RunEvent
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
