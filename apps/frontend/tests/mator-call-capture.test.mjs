import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceActivityGate, sampleRms } from '../components/mator/mator-call-capture.ts';

test('silence is never treated as a voice upload', () => {
  const g = new VoiceActivityGate();
  for (let i = 0; i < 11; i++) assert.equal(g.feed(0.002, 1000), 'waiting');
  assert.equal(g.feed(0, 1000), 'waiting'); // bounded frame clamping
  for (let i = 0; i < 100; i++) {
    const verdict = g.feed(0, 200);
    if (verdict === 'empty') return;
  }
  assert.fail('silence timeout did not fire');
});

test('sustained speech followed by silence terminates one utterance', () => {
  const gate = new VoiceActivityGate({ minSpeechMs: 120, endSilenceMs: 300 });
  assert.equal(gate.feed(0.06, 80), 'speech');
  assert.equal(gate.feed(0.04, 80), 'speech');
  assert.equal(gate.feed(0, 100), 'speech');
  assert.equal(gate.feed(0, 100), 'speech');
  assert.equal(gate.feed(0, 100), 'stop');
});

test('a tiny noise peak does not create an utterance', () => {
  const gate = new VoiceActivityGate({ minSpeechMs: 200, endSilenceMs: 300 });
  gate.feed(0.05, 60);
  assert.equal(gate.feed(0, 100), 'speech');
  assert.equal(gate.feed(0, 100), 'speech');
  assert.equal(gate.feed(0, 100), 'speech');
  assert.equal(gate.feed(0, 100), 'waiting');
});

test('maximum turn duration closes a long continuous utterance', () => {
  const gate = new VoiceActivityGate({ maxTurnMs: 500, minSpeechMs: 120 });
  let verdict = '';
  for (let i = 0; i < 10; i++) verdict = gate.feed(0.03, 100);
  assert.equal(verdict, 'stop');
});

test('sample RMS reports audio energy without relying on browser globals', () => {
  assert.equal(sampleRms(new Float32Array([0, 0, 0])), 0);
  assert.ok(Math.abs(sampleRms(new Float32Array([1, -1, 1, -1])) - 1) < 1e-10);
});