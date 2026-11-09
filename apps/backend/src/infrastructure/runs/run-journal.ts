import { appendFileSync, closeSync, fsyncSync, openSync, statSync, truncateSync } from 'node:fs';
import { isGrowthRunIdentity, sameGrowthRunIdentity } from '../../domain/run-identity.js';
import type { GrowthRunIdentity, RunSummary, StreamEvent } from '../../domain/types.js';

/** An immutable, per-child-run view of events actually written to disk. */
export type PersistedRunEvent = {
  id: number;
  runId: string;
  time: string;
  kind: 'status' | 'step' | 'audit' | 'approval' | 'input' | 'screenshot' | 'error' | 'result';
  message: string;
  details?: unknown;
  growth?: GrowthRunIdentity;
};

export class JournalWriteError extends Error {
  constructor(
    message: string,
    readonly compromised: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Retrying this disk transaction must never retry a browser action. */
export function appendRunEvent(path: string, event: StreamEvent): void {
  let length = 0;
  try {
    length = statSync(path).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new JournalWriteError('Run journal could not be inspected', true, { cause: error });
  }
  const line = `${JSON.stringify(event)}\n`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      appendFileSync(path, line, { encoding: 'utf8', mode: 0o600, flush: true });
      return;
    } catch (error) {
      // appendFileSync can write part of a line before throwing. Return to the
      // last committed boundary before retrying the same identity and bytes.
      try {
        truncateSync(path, length);
        const descriptor = openSync(path, 'r+');
        try {
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
      } catch (rollback) {
        if ((rollback as NodeJS.ErrnoException).code !== 'ENOENT' || length !== 0)
          throw new JournalWriteError('Run journal write failed; rollback failed', true, {
            cause: rollback,
          });
      }
      if (attempt === 2)
        throw new JournalWriteError(`Run journal write failed: ${String(error)}`, false, {
          cause: error,
        });
    }
  }
}

export type RunJournalPage = {
  events: PersistedRunEvent[];
  truncated: boolean;
  hasMore: boolean;
};

const kinds = new Set(['status', 'step', 'audit', 'approval', 'input', 'screenshot', 'error', 'result']);

export function parseRunJournal(
  raw: string,
  runId: string,
  options: {
    since?: number;
    limit?: number;
    expectedGrowth?: GrowthRunIdentity;
    expectedTerminal?: Pick<
      RunSummary,
      'terminalEventId' | 'state' | 'cleanupComplete' | 'historyIncomplete'
    >;
  } = {},
): RunJournalPage {
  const { since, limit = 1000 } = options;
  if (since !== undefined && (!Number.isSafeInteger(since) || since < 0))
    throw new Error('Invalid journal cursor');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid journal limit');
  if (raw.length > 0 && !raw.endsWith('\n')) {
    // A final unterminated segment. If it is not even valid JSON the write was
    // torn mid-line: fail with an explicit history-incomplete state. A complete
    // JSON value without the newline terminator is not valid JSONL and stays
    // corrupt rather than being silently accepted.
    const lastNewline = raw.lastIndexOf('\n');
    const tail = lastNewline === -1 ? raw : raw.slice(lastNewline + 1);
    try {
      JSON.parse(tail);
    } catch {
      throw new Error('History incomplete: journal ends mid-line');
    }
    throw new Error('Corrupt run journal');
  }

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
      typeof event.message !== 'string' ||
      (event.growth !== undefined && !isGrowthRunIdentity(event.growth)) ||
      (options.expectedGrowth !== undefined &&
        !sameGrowthRunIdentity(event.growth, options.expectedGrowth))
    )
      throw new Error('Corrupt run journal');
    lastId = event.id;
    events.push(entry as PersistedRunEvent);
  }

  const expected = options.expectedTerminal;
  if (expected?.terminalEventId !== undefined) {
    const terminal = events.at(-1);
    if (!terminal || terminal.id !== expected.terminalEventId)
      throw Error('History incomplete: committed terminal event is missing');
    const details = terminal.details as Record<string, unknown> | undefined;
    if (
      terminal.kind !== 'status' ||
      details?.terminalState !== expected.state ||
      details?.cleanupComplete !== expected.cleanupComplete ||
      details?.historyIncomplete !== expected.historyIncomplete
    )
      throw Error('Corrupt run journal');
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
