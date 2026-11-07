import { expect, test } from 'vitest';
import { fetchGrowthRunJournalPage } from '../modules/growth/model/growth-run-journal.ts';

test('journal page includes explicit server history-truncation metadata', async () => {
  const previous = globalThis.fetch;
  try {
    const controller = new AbortController();
    const events = [{ id: 3, kind: 'step', message: 'Observed' }];
    globalThis.fetch = async (path, options) => {
      expect(path).toBe('/api/runs/child%2Fone/logs');
      expect(options.signal).toBe(controller.signal);
      return {
        ok: true,
        headers: {
          get: (key) => (key === 'x-run-journal-truncated' ? 'true' : null),
        },
        json: async () => events,
      };
    };
    expect(
      await fetchGrowthRunJournalPage('child/one', controller.signal),
    ).toEqual({
      entries: events,
      truncated: true,
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test('invalid journal payload never becomes successful task history', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ fake: true }),
    });
    await expect(
      fetchGrowthRunJournalPage('child', new AbortController().signal),
    ).rejects.toThrow(/Invalid Runner journal/);
  } finally {
    globalThis.fetch = previous;
  }
});
