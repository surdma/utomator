
import { test, expect } from 'vitest';
import {
  sampleRms,
  VoiceActivityGate,
} from '../components/mator/mator-call-capture.ts';

test('silence is never treated as a voice upload', () => {
  const g = new VoiceActivityGate();
  for (let i = 0; i < 11; i++) expect(g.feed(0.002, 1000)).toEqual('waiting');
  expect(g.feed(0, 1000)).toEqual('waiting'); // bounded frame clamping
  for (let i = 0; i < 100; i++) {
    const verdict = g.feed(0, 200);
    if (verdict === 'empty') return;
  }
  throw new Error('silence timeout did not fire');
});

test('sustained speech followed by silence terminates one utterance', () => {
  const gate = new VoiceActivityGate({ minSpeechMs: 120, endSilenceMs: 300 });
  expect(gate.feed(0.06, 80)).toEqual('speech');
  expect(gate.feed(0.04, 80)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('stop');
});

test('a tiny noise peak does not create an utterance', () => {
  const gate = new VoiceActivityGate({ minSpeechMs: 200, endSilenceMs: 300 });
  gate.feed(0.05, 60);
  expect(gate.feed(0, 100)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('speech');
  expect(gate.feed(0, 100)).toEqual('waiting');
});

test('maximum turn duration closes a long continuous utterance', () => {
  const gate = new VoiceActivityGate({ maxTurnMs: 500, minSpeechMs: 120 });
  let verdict = '';
  for (let i = 0; i < 10; i++) verdict = gate.feed(0.03, 100);
  expect(verdict).toEqual('stop');
});

test('sample RMS reports audio energy without relying on browser globals', () => {
  expect(sampleRms(new Float32Array([0, 0, 0]))).toEqual(0);
  expect(Math.abs(sampleRms(new Float32Array([1, -1, 1, -1])) - 1) < 1e-10).toBeTruthy();
});
