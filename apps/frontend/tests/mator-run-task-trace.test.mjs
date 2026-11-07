import { expect, test } from 'vitest';
import { projectRunTaskTrace } from '../modules/mator/components/chat/mator-run-task-trace.ts';

const event = (id, kind, stage, stepId = 'inspect') => ({
  id,
  runId: 'child-run',
  kind,
  time: '2026-11-05T00:00:00Z',
  message: stage || kind,
  details: { stepId, stage },
});

test('generic status and screenshot events do not complete a task', () => {
  const result = projectRunTaskTrace([
    event(1, 'status', 'queued'),
    event(2, 'screenshot', 'capture'),
  ]);
  expect(result.steps).toEqual([]);
  expect(result.notes).toHaveLength(2);
});
test('multiple lifecycle events preserve one task identity', () => {
  const result = projectRunTaskTrace([
    event(1, 'step', 'started'),
    event(2, 'audit', 'observed'),
    event(3, 'step', 'completed'),
  ]);
  expect(result.steps.map((task) => [task.id, task.status])).toEqual([
    ['inspect', 'done'],
  ]);
  expect(result.running).toBe(false);
});
test('cancellation, blocking and failure override late completion', () => {
  for (const [state, expected] of [
    ['cancelled', 'cancelled'],
    ['blocked', 'blocked'],
    ['failed', 'error'],
  ]) {
    const result = projectRunTaskTrace([
      event(1, 'step', 'started'),
      { ...event(2, 'status', state), message: `Run ended: ${state}` },
      event(3, 'step', 'completed'),
    ]);
    expect(result.steps[0].status).toBe(expected);
    expect(result.running).toBe(false);
  }
});
test('conflicting replay IDs and unknown steps cannot forge completion', () => {
  const first = event(1, 'step', 'started');
  const conflicting = {
    ...first,
    details: { ...first.details, stage: 'completed' },
  };
  const result = projectRunTaskTrace([
    first,
    conflicting,
    event(2, 'step', 'completed', ''),
  ]);
  expect(result.steps).toEqual([]);
  expect(result.hasConflicts).toBe(true);
});
test('out of order delivery is reconstructed by numeric event ID', () => {
  const result = projectRunTaskTrace([
    event(2, 'step', 'completed'),
    event(1, 'step', 'started'),
  ]);
  expect(result.steps[0].status).toBe('done');
});
