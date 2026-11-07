export type TraceTaskStatus =
  | 'running'
  | 'done'
  | 'error'
  | 'blocked'
  | 'cancelled'
  | 'unknown';

export type TraceEvent = {
  id: number;
  runId: string;
  kind: string;
  message: string;
  details?: unknown;
};

export type TraceTask = { id: string; title: string; status: TraceTaskStatus };
export type TraceNote = { id: number; kind: string; message: string };

const taskPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const recognizedStages = new Set(['started', 'completed', 'failed']);

/** Only the Runner's recorded step lifecycle can mark a task complete. */
export function projectRunTaskTrace(events: readonly TraceEvent[]): {
  steps: TraceTask[];
  notes: TraceNote[];
  running: boolean;
  hasConflicts: boolean;
} {
  const runId = events[0]?.runId;
  const unique = new Map<number, TraceEvent>();
  const conflicting = new Set<number>();
  for (const event of events) {
    if (
      event.runId !== runId ||
      !Number.isSafeInteger(event.id) ||
      event.id < 1
    )
      continue;
    if (conflicting.has(event.id)) continue;
    const previous = unique.get(event.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
      unique.delete(event.id);
      conflicting.add(event.id);
    } else if (!previous) {
      unique.set(event.id, event);
    }
  }
  const sorted = [...unique.values()].sort((a, b) => a.id - b.id);
  const tasks = new Map<string, TraceTask>();
  const notes: TraceNote[] = [];
  let terminal: 'cancelled' | 'blocked' | 'failed' | 'completed' | null = null;
  for (const event of sorted) {
    const data = event.details;
    const details =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const stepId = details?.stepId;
    const phase = details?.stage;
    const taskEvent =
      event.kind === 'step' &&
      typeof stepId === 'string' &&
      taskPattern.test(stepId) &&
      typeof phase === 'string' &&
      recognizedStages.has(phase);
    if (taskEvent && !terminal) {
      const title = event.message
        .replace(/^(Started|Completed|Failed):\s*/i, '')
        .trim();
      tasks.set(stepId as string, {
        id: stepId as string,
        title:
          title || (tasks.get(stepId as string)?.title ?? (stepId as string)),
        status:
          phase === 'completed'
            ? 'done'
            : phase === 'failed'
              ? 'error'
              : 'running',
      });
      continue;
    }
    notes.push({ id: event.id, kind: event.kind, message: event.message });
    if (event.kind === 'status') {
      const state = /^Run ended:\s*(cancelled|blocked|failed|completed)/i.exec(
        event.message,
      );
      if (state) terminal = state[1].toLowerCase() as typeof terminal;
      else if (event.message === 'Run finished with verified steps')
        terminal = 'completed';
    }
    if (terminal) {
      for (const task of tasks.values()) {
        if (task.status !== 'running') continue;
        task.status =
          terminal === 'completed'
            ? 'unknown'
            : terminal === 'failed'
              ? 'error'
              : terminal;
      }
    }
  }
  const steps = [...tasks.values()];
  return {
    steps,
    notes,
    running: steps.some((step) => step.status === 'running'),
    hasConflicts: conflicting.size > 0,
  };
}
