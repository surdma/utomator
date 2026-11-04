/** An immutable, per-child-run view of events actually written to disk. */
export type PersistedRunEvent = {
  id: number;
  runId: string;
  time: string;
  kind: 'status' | 'step' | 'audit' | 'approval' | 'input' | 'screenshot' | 'error' | 'result';
  message: string;
  details?: unknown;
};

export type RunJournalPage = {
  events: PersistedRunEvent[];
  truncated: boolean;
  hasMore: boolean;
};

const kinds = new Set(['status', 'step', 'audit', 'approval', 'input', 'screenshot', 'error', 'result']);

export function parseRunJournal(
  raw: string,
  runId: string,
  options: { since?: number; limit?: number } = {},
): RunJournalPage {
  const { since, limit = 1000 } = options;
  if (since !== undefined && (!Number.isSafeInteger(since) || since < 0))
    throw new Error('Invalid journal cursor');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid journal limit');
  if (raw.length > 0 && !raw.endsWith('\n')) throw new Error('Corrupt run journal');

  const lines = raw.length ? raw.slice(0, -1).split('\n') : [];
  const events: PersistedRunEvent[] = [];
  let lastId = 0;
  for (const line of lines) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      throw new Error('Corrupt run journal');
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error('Corrupt run journal');
    const event = entry as Record<string, unknown>;
    if (
      event.runId !== runId ||
      typeof event.id !== 'number' ||
      !Number.isSafeInteger(event.id) ||
      event.id <= lastId ||
      typeof event.kind !== 'string' ||
      !kinds.has(event.kind) ||
      typeof event.time !== 'string' ||
      !Number.isFinite(Date.parse(event.time)) ||
      typeof event.message !== 'string'
    )
      throw new Error('Corrupt run journal');
    lastId = event.id;
    events.push(entry as PersistedRunEvent);
  }

  if (since !== undefined) {
    const filtered = events.filter((event) => event.id > since);
    return {
      events: filtered.slice(0, limit),
      hasMore: filtered.length > limit,
      truncated: false,
    };
  }
  return {
    events: events.slice(-limit),
    hasMore: false,
    truncated: events.length > limit,
  };
}
