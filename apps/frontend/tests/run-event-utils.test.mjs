import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendRunEvent,
  belongsToRun,
  isPauseOrResume,
  isTerminalRunStatus,
} from '../components/dashboard/pipeline/run-event-utils.ts';

const runEvent = (kind, message, id = 1, runId = 'run-one') => ({
  id,
  runId,
  kind,
  time: '2026-10-29T00:00:00.000Z',
  message,
});

test('replayed events are ignored without changing the previous array', () => {
  const first = runEvent('step', 'Inspect current page');
  const current = [first];
  assert.equal(appendRunEvent(current, first), current);
  assert.deepEqual(
    appendRunEvent(current, runEvent('step', 'Verify page', 2)),
    [first, runEvent('step', 'Verify page', 2)]
  );
});

test('events from other executions cannot update the selected run', () => {
  assert.equal(belongsToRun(runEvent('result', 'Done'), 'run-one'), true);
  assert.equal(belongsToRun(runEvent('result', 'Done'), 'run-two'), false);
  assert.equal(belongsToRun(runEvent('result', 'Done'), null), false);
});

test('only the existing status messages request a refresh', () => {
  assert.equal(isPauseOrResume(runEvent('status', 'Run paused')), true);
  assert.equal(isPauseOrResume(runEvent('status', 'Run resumed')), true);
  assert.equal(isPauseOrResume(runEvent('step', 'Run paused')), false);
  assert.equal(
    isTerminalRunStatus(runEvent('status', 'Run ended: completed')),
    true
  );
  assert.equal(isTerminalRunStatus(runEvent('status', 'Run finished')), true);
  assert.equal(isTerminalRunStatus(runEvent('result', 'Run finished')), false);
});
