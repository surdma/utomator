import { expect, test } from 'vitest';
import { reconcileRunJournal } from '../components/dashboard/pipeline/run-event-utils.ts';

const event = (id, runId = 'r1', stage = 'started') => ({
  id,
  runId,
  time: '2026-11-05T00:00:00Z',
  kind: 'step',
  message: 'Recorded task',
  details: { stepId: 'inspect', stage },
});

test('persisted replay and SSE merge by numeric ID without duplicate history', () => {
  const result = reconcileRunJournal([event(3)], [event(1), event(2), event(3)], 'r1');
  expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
});

test('selection never incorporates another run or malformed event ID', () => {
  const result = reconcileRunJournal(
    [event(2, 'unrelated')],
    [event(1), event(3, 'another'), event(-1)],
    'r1',
  );
  expect(result.map((item) => item.id)).toEqual([1]);
});

test('conflicting event IDs cannot restore fabricated task completion', () => {
  expect(reconcileRunJournal([event(1)], [event(1, 'r1', 'completed')], 'r1')).toEqual([]);
});
