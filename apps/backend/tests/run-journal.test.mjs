import { expect, test } from 'vitest';
import { parseRunJournal } from '../src/runs/run-journal.js';

const entry = (id, runId = 'r1', kind = 'step') => ({
  id,
  runId,
  kind,
  time: '2026-11-05T00:00:00.000Z',
  message: 'recorded',
  details: { stepId: 'inspect', stage: 'started' },
});
const serialize = (events) => events.map((item) => JSON.stringify(item)).join('\n') + '\n';

test('legacy log returns most recent 1000 with explicit truncation signal', () => {
  const page = parseRunJournal(serialize(Array.from({ length: 1005 }, (_, i) => entry(i + 1))), 'r1');
  expect(page.events).toHaveLength(1000);
  expect(page.events[0].id).toBe(6);
  expect(page.truncated).toBe(true);
});

test('cursor exposes ordered pages and hasMore without inventing past events', () => {
  const page = parseRunJournal(serialize([entry(1), entry(2), entry(3), entry(4)]), 'r1', {
    since: 1,
    limit: 2,
  });
  expect(page.events.map((item) => item.id)).toEqual([2, 3]);
  expect(page.hasMore).toBe(true);
  expect(page.truncated).toBe(false);
});

test('corrupt, duplicate, reordered, cross-run and incomplete JSONL fail closed', () => {
  expect(() => parseRunJournal(serialize([entry(1, 'another'), entry(2)]), 'r1')).toThrow(/Corrupt/);
  expect(() => parseRunJournal(serialize([entry(1), entry(1)]), 'r1')).toThrow(/Corrupt/);
  expect(() => parseRunJournal(serialize([entry(2), entry(1)]), 'r1')).toThrow(/Corrupt/);
  expect(() => parseRunJournal(serialize([entry(1), entry(2, 'r1', 'fake')]), 'r1')).toThrow(/Corrupt/);
  expect(() => parseRunJournal('{broken\n', 'r1')).toThrow(/Corrupt/);
  expect(() => parseRunJournal(JSON.stringify(entry(1)), 'r1')).toThrow(/Corrupt/);
});

test('rejects invalid pagination before reading events', () => {
  expect(() => parseRunJournal('', 'r1', { since: -1 })).toThrow(/Invalid journal cursor/);
  expect(() => parseRunJournal('', 'r1', { since: 1.5 })).toThrow(/Invalid journal cursor/);
  expect(() => parseRunJournal('', 'r1', { limit: 0 })).toThrow(/Invalid journal limit/);
});

test('a journal ending mid-line fails with history incomplete, not corrupt JSON', () => {
  const complete = serialize([entry(1), entry(2)]);
  expect(() => parseRunJournal(`${complete}{"id":3`, 'r1')).toThrow(/History incomplete/);
});

