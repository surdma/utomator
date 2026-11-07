import { expect, test } from 'vitest';
import {
  bestEchoCorrelation,
  NearEndGate,
  normalizedCorrelation,
} from '../modules/mator/components/mator-call-near-end.ts';

test('echo-correlated speaker playback does not trigger a near-end barge', () => {
  const g = new NearEndGate({ minSpeechMs: 180 });
  for (let i = 0; i < 30; i++)
    expect(g.feed(0.13, 0.23, 0.91, 40)).toEqual(false);
});
test('sustained actual near-end speech during output can trigger barge', () => {
  const g = new NearEndGate({ minSpeechMs: 180 });
  let interrupted = false;
  for (let i = 0; i < 8; i++) interrupted ||= g.feed(0.11, 0.25, 0.12, 40);
  expect(interrupted).toEqual(true);
});
test('short knocks do not interrupt', () => {
  const g = new NearEndGate({ minSpeechMs: 180 });
  expect(g.feed(0.2, 0.12, 0.01, 40)).toEqual(false);
  expect(g.feed(0.2, 0.12, 0.01, 40)).toEqual(false);
  expect(g.feed(0.0, 0.12, 0.01, 40)).toEqual(false);
  expect(g.feed(0.2, 0.12, 0.01, 40)).toEqual(false);
});
test('echo correlation measures matching output and rejects distinct speech', () => {
  const t = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i * 0.21));
  const copy = Float32Array.from(t);
  const separate = Float32Array.from({ length: 480 }, (_, i) =>
    Math.sin(i * 0.077),
  );
  expect(normalizedCorrelation(t, copy) > 0.99).toBeTruthy();
  expect(normalizedCorrelation(t, separate) < 0.15).toBeTruthy();
  const window = new Float32Array(1200);
  window.set(t, 480);
  expect(bestEchoCorrelation(t, window, 48000) > 0.99).toBeTruthy();
});
