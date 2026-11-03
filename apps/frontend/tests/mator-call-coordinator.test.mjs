import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MatorCallCoordinator } from '../components/mator/mator-call-coordinator.ts';
import { resolveMatorCallTurn } from '../components/mator/mator-call-contract.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Expected call state was not reached');
}
function createPorts(overrides = {}) {
  return {
    capture: async () => new Blob(['sound']),
    transcribe: async () => 'hello',
    respond: async (text) => ({ reply: `Reply to ${text}`, requiresAttention: false, eventIds: ['1'] }),
    speak: async () => {},
    stopOutput: () => {},
    onState: () => {},
    ...overrides,
  };
}

test('two turns are captured hands-free and playback completion gates next listen', async () => {
  const holdOutput = deferred();
  const holdCapture = deferred();
  const heard = [];
  let captures = 0;
  let spoken = 0;
  const call = new MatorCallCoordinator(createPorts({
    capture: () => ++captures < 3 ? Promise.resolve(new Blob(['audio'])) : holdCapture.promise,
    transcribe: async () => `turn ${captures}`,
    respond: async (text) => ({ reply: `answer ${text}`, requiresAttention: false, eventIds: [`a${captures}`] }),
    speak: (text) => { spoken++; heard.push(text); return spoken === 1 ? holdOutput.promise : Promise.resolve(); },
  }));
  assert.equal(captures, 0);
  call.start('workflow:conversation');
  await until(() => spoken === 1);
  assert.equal(captures, 1);
  holdOutput.resolve();
  await until(() => captures === 3);
  assert.deepEqual(heard, ['answer turn 1', 'answer turn 2']);
  call.end();
  holdCapture.resolve(null);
});

test('late transcription cannot send to a different thread after hangup', async () => {
  const delay = deferred();
  let sends = 0;
  const call = new MatorCallCoordinator(createPorts({
    transcribe: () => delay.promise,
    respond: async () => { sends++; return { reply: 'bad', requiresAttention: false, eventIds: [] }; },
  }));
  call.start('workflow:thread-A');
  await until(() => call.phase === 'transcribing');
  call.changeScope('workflow:thread-B');
  delay.resolve('private content');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sends, 0);
  assert.equal(call.phase, 'ended');
});

test('microphone mute pauses recording, but manual pause is not undone by unmute', async () => {
  let count = 0;
  const stall = deferred();
  const call = new MatorCallCoordinator(createPorts({ capture: () => { count++; return stall.promise; } }));
  call.start('workflow:thread');
  await until(() => count === 1);
  call.setMicMuted(true);
  assert.equal(call.phase, 'paused');
  call.setMicMuted(false);
  await until(() => count === 2);
  call.pause();
  call.setMicMuted(true);
  call.setMicMuted(false);
  assert.equal(call.phase, 'paused');
  call.end();
  stall.resolve(null);
});

test('provider errors pause indefinitely until explicit retry', async () => {
  let count = 0;
  const stall = deferred();
  const call = new MatorCallCoordinator(createPorts({
    capture: () => ++count === 1 ? Promise.resolve(new Blob(['audio'])) : stall.promise,
    transcribe: async () => { throw new Error('STT not ready'); },
  }));
  call.start('thread');
  await until(() => call.phase === 'error-paused');
  assert.equal(count, 1);
  call.resume();
  await until(() => count === 2);
  call.end();
  stall.resolve(null);
});

test('staged approval returns needs-attention instead of capturing again', async () => {
  let captures = 0;
  const call = new MatorCallCoordinator(createPorts({
    capture: async () => { captures++; return new Blob(['voice']); },
    respond: async () => ({ reply: 'Please approve this change in chat', requiresAttention: true, eventIds: ['approval'] }),
    speak: () => { assert.fail('Never speak action as if executed'); },
  }));
  call.start('scope');
  await until(() => call.phase === 'needs-attention');
  assert.equal(captures, 1);
  call.end();
});

test('speaker mute stops current output without muting the microphone', async () => {
  let stopped = 0;
  let captures = 0;
  const playing = deferred();
  const waiting = deferred();
  const call = new MatorCallCoordinator(createPorts({
    capture: () => ++captures === 1 ? Promise.resolve(new Blob(['voice'])) : waiting.promise,
    speak: () => playing.promise,
    stopOutput: () => { stopped++; playing.resolve(); },
  }));
  call.start('scope');
  await until(() => call.phase === 'speaking');
  call.setSpeakerMuted(true);
  await until(() => captures === 2);
  assert.ok(stopped >= 1);
  assert.equal(call.micMuted, false);
  call.end();
  waiting.resolve(null);
});

test('interrupt cancels output and immediately returns to listening', async () => {
  const waiting = deferred();
  const playback = deferred();
  let count = 0;
  const call = new MatorCallCoordinator(createPorts({
    capture: () => ++count === 1 ? Promise.resolve(new Blob(['x'])) : waiting.promise,
    speak: () => playback.promise,
    stopOutput: () => playback.resolve(),
  }));
  call.start('thread');
  await until(() => call.phase === 'speaking');
  call.interrupt();
  await until(() => count === 2);
  assert.equal(call.phase, 'listening');
  call.end();
  waiting.resolve(null);
});

test('call response only speaks the specific assistant message and honors staged/clarify gates', () => {
  const base = { conversationId: 'c', createdAt: '2026-11-02T00:00:00Z' };
  const happy = resolveMatorCallTurn([
    { ...base, id: 'u', role: 'user', kind: 'message', text: 'hello' },
    { ...base, id: 'how', role: 'assistant', kind: 'how', text: 'internal guidance' },
    { ...base, id: 'a', role: 'assistant', kind: 'message', text: 'Hi there' },
  ]);
  assert.deepEqual(happy, { reply: 'Hi there', requiresAttention: false, eventIds: ['u', 'how', 'a'] });
  const blocked = resolveMatorCallTurn([
    { ...base, id: 's', role: 'assistant', kind: 'action', status: 'staged', text: 'publish' },
    { ...base, id: 'a2', role: 'assistant', kind: 'message', text: 'Review it in chat' },
  ]);
  assert.equal(blocked.requiresAttention, true);
  const missing = resolveMatorCallTurn([{ ...base, id: 'u', role: 'user', kind: 'message', text: 'hello' }]);
  assert.equal(missing.requiresAttention, true);
});

test('no-speech capture returns without making a network request', async () => {
  let calls = 0;
  const waiting = deferred();
  const call = new MatorCallCoordinator(createPorts({
    capture: () => ++calls === 1 ? Promise.resolve(null) : waiting.promise,
    transcribe: () => { assert.fail('No STT for empty turn'); },
  }));
  call.start('thread');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(calls >= 2);
  call.end();
  waiting.resolve(null);
});

test('transcribed words remain available if sending the AI call request fails', async () => {
  const transcripts = [];
  let error = '';
  const call = new MatorCallCoordinator(createPorts({
    capture: async () => new Blob(['spoken request']),
    transcribe: async () => 'Keep my draft even after a provider error',
    respond: async () => { throw new Error('secret provider stack from server'); },
    onTranscript: (text) => transcripts.push(text),
    onState: (state) => { if (state.phase === 'error-paused') error = state.detail; },
  }));
  call.start('workflow:thread');
  await until(() => call.phase === 'error-paused');
  assert.deepEqual(transcripts, ['Keep my draft even after a provider error']);
  assert.doesNotMatch(error, /secret provider stack/);
  assert.match(error, /resume|retry/i);
  call.end();
});