
import { test, expect } from 'vitest';
import { fetchGrowthRunJournal } from '../lib/growth-run-journal.ts';

test('journal request uses the child run identifier and forwards cancellation', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const entries = [{ kind: 'step', message: 'Started' }];
    globalThis.fetch = async (path, options) => {
      expect(path).toEqual('/api/runs/run%2Fone/logs');
      expect(options.cache).toEqual('no-store');
      expect(options.signal).toEqual(controller.signal);
      return { ok: true, json: async () => entries };
    };
    expect(await fetchGrowthRunJournal('run/one', controller.signal)).toEqual(entries);
  } finally {
    globalThis.fetch = previous;
  }
});

test('journal request reports server errors without claiming tasks completed', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await expect((fetchGrowthRunJournal('run-one', new AbortController().signal))).rejects.toThrow(/Runner event journal unavailable \(HTTP 503\)/);
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ task: 'fake' }),
    });
    await expect((fetchGrowthRunJournal('run-one', new AbortController().signal))).rejects.toThrow(/Invalid Runner journal/);
  } finally {
    globalThis.fetch = previous;
  }
});
