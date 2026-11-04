
import { test, expect } from 'vitest';
import {
  acquireCurrentVoiceStream,
  createVoiceDeliveryGate,
  readVoiceSupport,
} from '../components/mator/voice-support.ts';

test('voice support stays unavailable when speech recognition is missing', () => {
  expect(readVoiceSupport(undefined)).toEqual('unsupported');
  expect(readVoiceSupport({})).toEqual('unsupported');
  expect(readVoiceSupport({ SpeechRecognition: function SpeechRecognition() {} })).toEqual('ready');
  expect(readVoiceSupport({
      webkitSpeechRecognition: function webkitSpeechRecognition() {},
    })).toEqual('ready');
  expect(readVoiceSupport({ SpeechRecognition: 'present' })).toEqual('unsupported');
});

test('late microphone permission releases its tracks after cancellation', async () => {
  let resolveStream;
  const permission = new Promise((resolve) => {
    resolveStream = resolve;
  });
  let current = true;
  let stops = 0;
  const acquisition = acquireCurrentVoiceStream(
    () => permission,
    () => current,
  );
  current = false;
  resolveStream({
    getTracks: () => [
      {
        stop: () => {
          stops += 1;
        },
      },
    ],
  });
  expect(await acquisition).toEqual(null);
  expect(stops).toEqual(1);
});

test('current microphone permission keeps its stream for recording', async () => {
  let stops = 0;
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stops += 1;
        },
      },
    ],
  };
  const acquired = await acquireCurrentVoiceStream(
    async () => stream,
    () => true,
  );
  expect(acquired).toEqual(stream);
  expect(stops).toEqual(0);
});

test('completed transcription cannot reach a different conversation after invalidation', async () => {
  const gate = createVoiceDeliveryGate();
  const original = gate.start();
  let fulfill;
  const pending = new Promise((resolve) => {
    fulfill = resolve;
  });
  const delivered = [];
  const completion = pending.then((text) => {
    if (gate.isCurrent(original)) delivered.push(text);
  });
  gate.invalidate(); // Thread switch occurred while transcription was pending.
  fulfill('Message intended for the previous thread');
  await completion;
  expect(delivered).toEqual([]);
});

test('a newer recording supersedes an older pending transcript', () => {
  const gate = createVoiceDeliveryGate();
  const first = gate.start();
  const second = gate.start();
  expect(gate.isCurrent(first)).toEqual(false);
  expect(gate.isCurrent(second)).toEqual(true);
  gate.invalidate();
  expect(gate.isCurrent(second)).toEqual(false);
});
