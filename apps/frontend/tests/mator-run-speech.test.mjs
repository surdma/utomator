import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectRunSpeechUpdates, summarizeRunEventForSpeech } from '../components/dashboard/pipeline/mator-run-speech.ts';

const runEvent = (id, kind, message, runId='run-1') => ({ id, kind, message, runId, time:'2026-11-01T11:00:00Z' });

test('speaks actual Runner start, step progress and completion', () => {
  const seen = new Set();
  const updates = collectRunSpeechUpdates([
    runEvent(1, 'status', 'Run queued for browser startup'),
    runEvent(2, 'step', 'Started: Inspect profile evidence'),
    runEvent(3, 'step', 'Completed: Inspect profile evidence'),
    runEvent(4, 'status', 'Run finished with verified steps'),
  ], 'run-1', seen);
  assert.equal(updates.length, 4);
  assert.match(updates[0], /starting/);
  assert.match(updates[1], /Inspect profile evidence/);
  assert.match(updates[3], /verified/);
  assert.deepEqual(collectRunSpeechUpdates([runEvent(4,'status','Run finished with verified steps')], 'run-1', seen), []);
});
test('never speaks raw error diagnostics', () => {
  for (const item of [
    runEvent(2,'error','Failed token: supersecret123 at localhost'),
    runEvent(3,'step','Failed: page private user@example.com'),
    runEvent(4,'status','Run ended: failed')
  ]) {
    const spoken = summarizeRunEventForSpeech(item);
    assert.ok(spoken);
    assert.doesNotMatch(spoken, /supersecret|private user|@example|localhost/);
  }
});
test('unrelated runs and noisy events are silent', () => {
  const seen = new Set();
  assert.deepEqual(collectRunSpeechUpdates([
    runEvent(1,'step','Started: Other run step','run-2'),
    runEvent(2,'screenshot','Captured screenshot'),
    runEvent(3,'status','Authenticated account verified for this run'),
  ],'run-1',seen),[]);
});
test('approvals and input needs are short and accurate', () => {
  assert.match(summarizeRunEventForSpeech(runEvent(1,'approval','Private approval reference')), /approval/);
  assert.match(summarizeRunEventForSpeech(runEvent(2,'input','Private input reference')), /more information/);
  assert.match(summarizeRunEventForSpeech(runEvent(3,'status','Run ended: cancelled')), /cancelled/);
});
