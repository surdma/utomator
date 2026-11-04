
import { test, expect } from 'vitest';
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
  expect(appendRunEvent(current, first)).toEqual(current);
  expect(appendRunEvent(current, runEvent('step', 'Verify page', 2))).toEqual([first, runEvent('step', 'Verify page', 2)]);
});

test('events from other executions cannot update the selected run', () => {
  expect(belongsToRun(runEvent('result', 'Done'), 'run-one')).toEqual(true);
  expect(belongsToRun(runEvent('result', 'Done'), 'run-two')).toEqual(false);
  expect(belongsToRun(runEvent('result', 'Done'), null)).toEqual(false);
});

test('only the existing status messages request a refresh', () => {
  expect(isPauseOrResume(runEvent('status', 'Run paused'))).toEqual(true);
  expect(isPauseOrResume(runEvent('status', 'Run resumed'))).toEqual(true);
  expect(isPauseOrResume(runEvent('step', 'Run paused'))).toEqual(false);
  expect(isTerminalRunStatus(runEvent('status', 'Run ended: completed'))).toEqual(true);
  expect(isTerminalRunStatus(runEvent('status', 'Run finished'))).toEqual(true);
  expect(isTerminalRunStatus(runEvent('result', 'Run finished'))).toEqual(false);
});
