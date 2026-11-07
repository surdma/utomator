import { expect, test } from 'vitest';
import { fetchGrowthRunJournal } from '../lib/growth-run-journal.ts';

test('journal request uses the child run identifier, starts at cursor 0 and forwards cancellation', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const entries = [{ id: 1, kind: 'step', message: 'Started' }];
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push(String(path));
      expect(options.cache).toEqual('no-store');
      expect(options.signal).toEqual(controller.signal);
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => entries,
      };
    };
    expect(await fetchGrowthRunJournal('run/one', controller.signal)).toEqual(
      entries,
    );
    expect(calls).toEqual(['/api/runs/run%2Fone/logs?since=0']);
  } finally {
    globalThis.fetch = previous;
  }
});

test('consumes every available page until hasMore is false', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const page1 = [{ id: 1, kind: 'step', message: 'Started' }];
    const page2 = [{ id: 2, kind: 'step', message: 'Completed' }];
    let call = 0;
    globalThis.fetch = async (path) => {
      call += 1;
      if (call === 1) {
        expect(path).toBe('/api/runs/run-one/logs?since=0');
        return {
          ok: true,
          headers: {
            get: (key) => (key === 'x-run-journal-has-more' ? 'true' : null),
          },
          json: async () => page1,
        };
      }
      expect(path).toBe('/api/runs/run-one/logs?since=1');
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => page2,
      };
    };
    expect(await fetchGrowthRunJournal('run-one', controller.signal)).toEqual([
      ...page1,
      ...page2,
    ]);
    expect(call).toBe(2);
  } finally {
    globalThis.fetch = previous;
  }
});

test('stops paginating when a page returns no events', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const page1 = [{ id: 1, kind: 'step', message: 'Started' }];
    let call = 0;
    globalThis.fetch = async (_path) => {
      call += 1;
      return {
        ok: true,
        headers: {
          get: (key) => (key === 'x-run-journal-has-more' ? 'true' : null),
        },
        json: async () => (call === 1 ? page1 : []),
      };
    };
    expect(await fetchGrowthRunJournal('run-one', controller.signal)).toEqual(
      page1,
    );
    expect(call).toBe(2);
  } finally {
    globalThis.fetch = previous;
  }
});

test('journal request reports server errors without claiming tasks completed', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await expect(
      fetchGrowthRunJournal('run-one', new AbortController().signal),
    ).rejects.toThrow(/Runner event journal unavailable \(HTTP 503\)/);
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ task: 'fake' }),
    });
    await expect(
      fetchGrowthRunJournal('run-one', new AbortController().signal),
    ).rejects.toThrow(/Invalid Runner journal/);
  } finally {
    globalThis.fetch = previous;
  }
});
