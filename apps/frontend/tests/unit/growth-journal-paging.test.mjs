import { afterEach, expect, test, vi } from 'vitest';
import { fetchGrowthRunJournal } from '../../modules/growth/model/growth-run-journal.ts';
import {
  childId,
  recordedEvent,
} from '../support/growth-execution-fixture.mjs';

afterEach(() => vi.unstubAllGlobals());
const response = (events, headers = {}) =>
  new Response(JSON.stringify(events), { headers });

test('loads more than the initial thousand persisted events in cursor order', async () => {
  const source = Array.from({ length: 2105 }, (_, index) =>
    recordedEvent(index + 1, 'observe', 'started'),
  );
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    const cursor = Number(
      new URL(url, 'http://localhost').searchParams.get('since'),
    );
    calls.push(cursor);
    return response(source.slice(cursor, cursor + 1000), {
      'x-run-journal-has-more': String(cursor + 1000 < source.length),
    });
  });
  const events = await fetchGrowthRunJournal(
    childId,
    new AbortController().signal,
  );
  expect(calls).toEqual([0, 1000, 2000]);
  expect(events.length).toBe(2105);
  expect(events.at(-1).id).toBe(2105);
});

test.each(['repeat', 'empty', 'foreign', 'truncated', 'conflict'])(
  'a %s page fails instead of producing incomplete successful history',
  async (mode) => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      if (calls > 3) throw Error('Pagination loop');
      const first = recordedEvent(1, 'observe', 'started');
      if (mode === 'empty')
        return response([], { 'x-run-journal-has-more': 'true' });
      if (mode === 'foreign') return response([{ ...first, runId: 'other' }]);
      if (mode === 'truncated')
        return response([first], { 'x-run-journal-truncated': 'true' });
      if (mode === 'conflict')
        return response([first, { ...first, message: 'Conflict' }]);
      return response([first], { 'x-run-journal-has-more': 'true' });
    });
    await expect(
      fetchGrowthRunJournal(childId, new AbortController().signal),
    ).rejects.toThrow(/journal|cursor|incomplete/i);
    expect(calls).toBeLessThanOrEqual(2);
  },
);

test('aborting a paged fetch never resolves partial events', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', async () => {
    controller.abort();
    return response([recordedEvent(1, 'observe', 'started')], {
      'x-run-journal-has-more': 'true',
    });
  });
  await expect(
    fetchGrowthRunJournal(childId, controller.signal),
  ).rejects.toThrow(/abort/i);
});
