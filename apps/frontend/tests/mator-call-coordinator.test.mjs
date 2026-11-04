
import { test, expect } from 'vitest';
import { resolveMatorCallTurn } from '../components/mator/mator-call-contract.ts';
import { MatorCallCoordinator } from '../components/mator/mator-call-coordinator.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Expected call state was not reached');
}
function createPorts(overrides = {}) {
  return {
    capture: async () => new Blob(['sound']),
    transcribe: async () => 'hello',
    respond: async (text) => ({
      reply: `Reply to ${text}`,
      requiresAttention: false,
      eventIds: ['1'],
    }),
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
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () =>
        ++captures < 3
          ? Promise.resolve(new Blob(['audio']))
          : holdCapture.promise,
      transcribe: async () => `turn ${captures}`,
      respond: async (text) => ({
        reply: `answer ${text}`,
        requiresAttention: false,
        eventIds: [`a${captures}`],
      }),
      speak: (text) => {
        spoken++;
        heard.push(text);
        return spoken === 1 ? holdOutput.promise : Promise.resolve();
      },
    }),
  );
  expect(captures).toEqual(0);
  call.start('workflow:conversation');
  await until(() => spoken === 1);
  expect(captures).toEqual(1);
  holdOutput.resolve();
  await until(() => captures === 3);
  expect(heard).toEqual(['answer turn 1', 'answer turn 2']);
  call.end();
  holdCapture.resolve(null);
});

test('late transcription cannot send to a different thread after hangup', async () => {
  const delay = deferred();
  let sends = 0;
  const call = new MatorCallCoordinator(
    createPorts({
      transcribe: () => delay.promise,
      respond: async () => {
        sends++;
        return { reply: 'bad', requiresAttention: false, eventIds: [] };
      },
    }),
  );
  call.start('workflow:thread-A');
  await until(() => call.phase === 'transcribing');
  call.changeScope('workflow:thread-B');
  delay.resolve('private content');
  await new Promise((resolve) => setImmediate(resolve));
  expect(sends).toEqual(0);
  expect(call.phase).toEqual('ended');
});

test('microphone mute pauses recording, but manual pause is not undone by unmute', async () => {
  let count = 0;
  const stall = deferred();
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () => {
        count++;
        return stall.promise;
      },
    }),
  );
  call.start('workflow:thread');
  await until(() => count === 1);
  call.setMicMuted(true);
  expect(call.phase).toEqual('paused');
  call.setMicMuted(false);
  await until(() => count === 2);
  call.pause();
  call.setMicMuted(true);
  call.setMicMuted(false);
  expect(call.phase).toEqual('paused');
  call.end();
  stall.resolve(null);
});

test('provider errors pause indefinitely until explicit retry', async () => {
  let count = 0;
  const stall = deferred();
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () =>
        ++count === 1 ? Promise.resolve(new Blob(['audio'])) : stall.promise,
      transcribe: async () => {
        throw new Error('STT not ready');
      },
    }),
  );
  call.start('thread');
  await until(() => call.phase === 'error-paused');
  expect(count).toEqual(1);
  call.resume();
  await until(() => count === 2);
  call.end();
  stall.resolve(null);
});

test('staged approval returns needs-attention instead of capturing again', async () => {
  let captures = 0;
  const call = new MatorCallCoordinator(
    createPorts({
      capture: async () => {
        captures++;
        return new Blob(['voice']);
      },
      respond: async () => ({
        reply: 'Please approve this change in chat',
        requiresAttention: true,
        eventIds: ['approval'],
      }),
      speak: () => {
        throw new Error('Never speak action as if executed');
      },
    }),
  );
  call.start('scope');
  await until(() => call.phase === 'needs-attention');
  expect(captures).toEqual(1);
  call.end();
});

test('speaker mute stops current output without muting the microphone', async () => {
  let stopped = 0;
  let captures = 0;
  const playing = deferred();
  const waiting = deferred();
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () =>
        ++captures === 1
          ? Promise.resolve(new Blob(['voice']))
          : waiting.promise,
      speak: () => playing.promise,
      stopOutput: () => {
        stopped++;
        playing.resolve();
      },
    }),
  );
  call.start('scope');
  await until(() => call.phase === 'speaking');
  call.setSpeakerMuted(true);
  await until(() => captures === 2);
  expect(stopped >= 1).toBeTruthy();
  expect(call.micMuted).toEqual(false);
  call.end();
  waiting.resolve(null);
});

test('interrupt cancels output and immediately returns to listening', async () => {
  const waiting = deferred();
  const playback = deferred();
  let count = 0;
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () =>
        ++count === 1 ? Promise.resolve(new Blob(['x'])) : waiting.promise,
      speak: () => playback.promise,
      stopOutput: () => playback.resolve(),
    }),
  );
  call.start('thread');
  await until(() => call.phase === 'speaking');
  call.interrupt();
  await until(() => count === 2);
  expect(call.phase).toEqual('listening');
  call.end();
  waiting.resolve(null);
});

test('call response only speaks the specific assistant message and honors staged/clarify gates', () => {
  const base = { conversationId: 'c', createdAt: '2026-11-02T00:00:00Z' };
  const happy = resolveMatorCallTurn([
    { ...base, id: 'u', role: 'user', kind: 'message', text: 'hello' },
    {
      ...base,
      id: 'how',
      role: 'assistant',
      kind: 'how',
      text: 'internal guidance',
    },
    { ...base, id: 'a', role: 'assistant', kind: 'message', text: 'Hi there' },
  ]);
  expect(happy).toEqual({
    reply: 'Hi there',
    requiresAttention: false,
    eventIds: ['u', 'how', 'a'],
  });
  const blocked = resolveMatorCallTurn([
    {
      ...base,
      id: 's',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      text: 'publish',
    },
    {
      ...base,
      id: 'a2',
      role: 'assistant',
      kind: 'message',
      text: 'Review it in chat',
    },
  ]);
  expect(blocked.requiresAttention).toEqual(true);
  const missing = resolveMatorCallTurn([
    { ...base, id: 'u', role: 'user', kind: 'message', text: 'hello' },
  ]);
  expect(missing.requiresAttention).toEqual(true);
});

test('no-speech capture returns without making a network request', async () => {
  let calls = 0;
  const waiting = deferred();
  const call = new MatorCallCoordinator(
    createPorts({
      capture: () => (++calls === 1 ? Promise.resolve(null) : waiting.promise),
      transcribe: () => {
        throw new Error('No STT for empty turn');
      },
    }),
  );
  call.start('thread');
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(calls >= 2).toBeTruthy();
  call.end();
  waiting.resolve(null);
});

test('transcribed words remain available if sending the AI call request fails', async () => {
  const transcripts = [];
  let error = '';
  const call = new MatorCallCoordinator(
    createPorts({
      capture: async () => new Blob(['spoken request']),
      transcribe: async () => 'Keep my draft even after a provider error',
      respond: async () => {
        throw new Error('secret provider stack from server');
      },
      onTranscript: (text) => transcripts.push(text),
      onState: (state) => {
        if (state.phase === 'error-paused') error = state.detail;
      },
    }),
  );
  call.start('workflow:thread');
  await until(() => call.phase === 'error-paused');
  expect(transcripts).toEqual(['Keep my draft even after a provider error']);
  expect(error).not.toMatch(/secret provider stack/);
  expect(error).toMatch(/resume|retry/i);
  call.end();
});
