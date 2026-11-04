/**
 * Classifies near-end speech while far-end TTS is playing.
 * Both streams must come from the same Web Audio context/sample clock.
 * This filter supplements browser AEC; it does not replace device testing.
 */
export type NearEndOptions = {
  minRms?: number;
  minSpeechMs?: number;
  echoCorrelationLimit?: number;
};
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
export function normalizedCorrelation(
  left: Float32Array,
  right: Float32Array,
): number {
  const n = Math.min(left.length, right.length);
  if (n === 0) return 0;
  let dot = 0,
    a = 0,
    b = 0;
  for (let i = 0; i < n; i++) {
    dot += left[i]! * right[i]!;
    a += left[i]! ** 2;
    b += right[i]! ** 2;
  }
  return a * b > 1e-10 ? Math.abs(dot / Math.sqrt(a * b)) : 0;
}
export function bestEchoCorrelation(
  mic: Float32Array,
  ref: Float32Array,
  sampleRate: number,
): number {
  if (!mic.length || ref.length < mic.length) return 0;
  // Output may reach the mic tens of milliseconds after the browser audio callback.
  const samplesPerStep = Math.max(1, Math.floor(sampleRate * 0.01));
  let best = 0;
  for (
    let offset = 0;
    offset + mic.length <= ref.length;
    offset += samplesPerStep
  ) {
    const match = normalizedCorrelation(
      mic,
      ref.subarray(offset, offset + mic.length),
    );
    if (match > best) best = match;
  }
  return best;
}

export class NearEndGate {
  private consecutiveMs = 0;
  private minRms: number;
  private minSpeechMs: number;
  private echoLimit: number;
  constructor(options: NearEndOptions = {}) {
    this.minRms = options.minRms ?? 0.014;
    this.minSpeechMs = options.minSpeechMs ?? 210;
    this.echoLimit = options.echoCorrelationLimit ?? 0.55;
  }
  feed(
    microphoneRms: number,
    farEndRms: number,
    correlation: number,
    elapsedMs: number,
  ): boolean {
    // The hardware echo canceller usually leaves little far-end audio. Raw
    // output bleed is vetoed when it closely tracks the output samples.
    const echo = farEndRms > 0.008 && correlation >= this.echoLimit;
    const nearEnd =
      !echo && microphoneRms >= Math.max(this.minRms, farEndRms * 0.065);
    this.consecutiveMs = nearEnd
      ? this.consecutiveMs + Math.max(0, Math.min(100, elapsedMs))
      : 0;
    return this.consecutiveMs >= this.minSpeechMs;
  }
  reset() {
    this.consecutiveMs = 0;
  }
}
