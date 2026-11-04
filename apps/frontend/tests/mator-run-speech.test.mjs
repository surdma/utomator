
import { test, expect } from 'vitest';
import {
  collectRunSpeechUpdates,
  summarizeRunEventForSpeech,
} from '../components/mator/mator-run-speech.ts';

const runEvent = (id, kind, message, runId = 'run-1') => ({
  id,
  kind,
  message,
  runId,
  time: '2026-11-01T11:00:00Z',
});

test('speaks actual Runner start, step progress and completion', () => {
  const seen = new Set();
  const updates = collectRunSpeechUpdates(
    [
      runEvent(1, 'status', 'Run queued for browser startup'),
      runEvent(2, 'step', 'Started: Inspect profile evidence'),
      runEvent(3, 'step', 'Completed: Inspect profile evidence'),
      runEvent(4, 'status', 'Run finished with verified steps'),
    ],
    'run-1',
    seen,
  );
  expect(updates.length).toEqual(4);
  expect(updates[0]).toMatch(/starting/);
  expect(updates[1]).toMatch(/Inspect profile evidence/);
  expect(updates[3]).toMatch(/verified/);
  expect(collectRunSpeechUpdates(
      [runEvent(4, 'status', 'Run finished with verified steps')],
      'run-1',
      seen,
    )).toEqual([]);
});
test('never speaks raw error diagnostics', () => {
  for (const item of [
    runEvent(2, 'error', 'Failed token: supersecret123 at localhost'),
    runEvent(3, 'step', 'Failed: page private user@example.com'),
    runEvent(4, 'status', 'Run ended: failed'),
  ]) {
    const spoken = summarizeRunEventForSpeech(item);
    expect(spoken).toBeTruthy();
    expect(spoken).not.toMatch(/supersecret|private user|@example|localhost/);
  }
});
test('unrelated runs and noisy events are silent', () => {
  const seen = new Set();
  expect(collectRunSpeechUpdates(
      [
        runEvent(1, 'step', 'Started: Other run step', 'run-2'),
        runEvent(2, 'screenshot', 'Captured screenshot'),
        runEvent(3, 'status', 'Authenticated account verified for this run'),
      ],
      'run-1',
      seen,
    )).toEqual([]);
});
test('approvals and input needs are short and accurate', () => {
  expect(summarizeRunEventForSpeech(
      runEvent(1, 'approval', 'Private approval reference'),
    )).toMatch(/approval/);
  expect(summarizeRunEventForSpeech(runEvent(2, 'input', 'Private input reference'))).toMatch(/more information/);
  expect(summarizeRunEventForSpeech(runEvent(3, 'status', 'Run ended: cancelled'))).toMatch(/cancelled/);
});
