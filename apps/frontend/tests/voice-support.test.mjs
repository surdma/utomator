import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acquireCurrentVoiceStream,
  createVoiceDeliveryGate,
  readVoiceSupport,
} from '../components/dashboard/pipeline/voice-support.ts';

test('voice support stays unavailable when speech recognition is missing', () => {
  assert.equal(readVoiceSupport(undefined), 'unsupported');
  assert.equal(readVoiceSupport({}), 'unsupported');
  assert.equal(
    readVoiceSupport({ SpeechRecognition: function SpeechRecognition() {} }),
    'ready'
  );
  assert.equal(
    readVoiceSupport({
      webkitSpeechRecognition: function webkitSpeechRecognition() {},
    }),
    'ready'
  );
  assert.equal(
    readVoiceSupport({ SpeechRecognition: 'present' }),
    'unsupported'
  );
});

test('late microphone permission releases its tracks after cancellation', async () => {
  let resolveStream;
  const permission = new Promise((resolve) => {
    resolveStream = resolve;
  });
  let current = true;
  let stops = 0;
  const acquisition = acquireCurrentVoiceStream(() => permission, () => current);
  current = false;
  resolveStream({
    getTracks: () => [{ stop: () => { stops += 1; } }],
  });
  assert.equal(await acquisition, null);
  assert.equal(stops, 1);
});

test('current microphone permission keeps its stream for recording', async () => {
  let stops = 0;
  const stream = { getTracks: () => [{ stop: () => { stops += 1; } }] };
  const acquired = await acquireCurrentVoiceStream(
    async () => stream,
    () => true
  );
  assert.equal(acquired, stream);
  assert.equal(stops, 0);
});

test('completed transcription cannot reach a different conversation after invalidation', async () => {
  const gate = createVoiceDeliveryGate();
  const original = gate.start();
  let fulfill;
  const pending = new Promise((resolve) => { fulfill = resolve; });
  const delivered = [];
  const completion = pending.then((text) => {
    if (gate.isCurrent(original)) delivered.push(text);
  });
  gate.invalidate(); // Thread switch occurred while transcription was pending.
  fulfill('Message intended for the previous thread');
  await completion;
  assert.deepEqual(delivered, []);
});

test('a newer recording supersedes an older pending transcript', () => {
  const gate = createVoiceDeliveryGate();
  const first = gate.start();
  const second = gate.start();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
});
