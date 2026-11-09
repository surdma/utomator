import { afterEach, expect, test, vi } from 'vitest';
import { ApprovalGate } from '../../src/infrastructure/runs/approvals.js';
import { PromptGate } from '../../src/infrastructure/runs/prompts.js';

afterEach(() => vi.useRealTimers());

test.each([
  ['approval', () => new ApprovalGate()],
  ['input', () => new PromptGate()],
] as const)(
  '%s announcement failure removes the pending gate and its timer',
  async (_name, makeGate) => {
    vi.useFakeTimers();
    const gate = makeGate();
    const controller = new AbortController();
    await expect(
      gate.request(
        'run-one',
        () => {
          throw new Error('Journal unavailable');
        },
        controller.signal,
      ),
    ).rejects.toThrow(/Journal unavailable/);
    expect(vi.getTimerCount()).toBe(0);
    const next = gate.request('run-one', () => {}, controller.signal);
    controller.abort();
    await next;
    expect(vi.getTimerCount()).toBe(0);
  },
);
