import { expect, test, vi } from 'vitest';
import { Runner } from '../src/infrastructure/runs/runner.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    appendFileSync: vi.fn(() => {
      throw new Error('ENOSPC: no space left on device, write failed');
    }),
  };
});

import { appendFileSync } from 'node:fs';

test('Runner stops and marks the run failed when the journal write fails (fail closed)', async () => {
  vi.mocked(appendFileSync).mockImplementation(() => {
    throw new Error('ENOSPC: no space left on device, write failed');
  });
  const runner = new Runner();
  const summary = runner.start({
    platform: 'linkedin',
    action: 'audit',
    profileUrl: 'https://www.linkedin.com/in/john-doe/',
  });
  await vi.waitFor(() => expect(runner.isIdle()).toBe(true));
  // The durable record could not be extended, so execution must not proceed
  // to a completed (or even running) state.
  expect(summary.state).toBe('failed');
  expect(summary.error).toContain('journal write failed');
  const run = runner.get(summary.id);
  expect(run?.state).toBe('failed');
  // The unwritten optimistic event is retracted; no progress event survives
  // as durable evidence of a step that never actually ran.
  const recorded = runner.events.getSince(0, summary.id);
  expect(
    recorded.some((e) => e.kind === 'status' && e.message === 'Run queued for browser startup'),
  ).toBe(false);
  // The status API reports failure without inventing a journal event.
  expect(recorded.some((e) => e.kind === 'status' && e.message === `Run ended: ${summary.state}`)).toBe(
    false,
  );
  expect(summary.historyIncomplete).toBe(true);
});
