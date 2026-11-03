/** Browser-only, bounded speech-turn capture for Mator AI Call. */
export type VoiceActivityOptions = {
  threshold?: number;
  minSpeechMs?: number;
  endSilenceMs?: number;
  maxWaitMs?: number;
  maxTurnMs?: number;
};

/** Pure time-based VAD gate, separated so its decisions can be tested without a microphone. */
export class VoiceActivityGate {
  private spokenMs = 0;
  private quietMs = 0;
  private elapsedMs = 0;
  private firstVoiceAt: number | null = null;
  private lastVoiceAt: number | null = null;
  private options: Required<VoiceActivityOptions>;

  constructor(options: VoiceActivityOptions = {}) {
    this.options = {
      threshold: options.threshold ?? 0.018,
      minSpeechMs: options.minSpeechMs ?? 180,
      endSilenceMs: options.endSilenceMs ?? 900,
      maxWaitMs: options.maxWaitMs ?? 12000,
      maxTurnMs: options.maxTurnMs ?? 25000,
    };
  }

  feed(level: number, deltaMs: number): 'waiting' | 'speech' | 'stop' | 'empty' {
    const elapsed = Math.max(0, Math.min(200, deltaMs));
    this.elapsedMs += elapsed;
    if (level >= this.options.threshold) {
      if (this.firstVoiceAt === null) this.firstVoiceAt = this.elapsedMs;
      this.lastVoiceAt = this.elapsedMs;
      this.spokenMs += elapsed;
      this.quietMs = 0;
    } else if (this.firstVoiceAt !== null) {
      this.quietMs += elapsed;
    }
    if (this.firstVoiceAt === null) {
      return this.elapsedMs >= this.options.maxWaitMs ? 'empty' : 'waiting';
    }
    if (this.elapsedMs - this.firstVoiceAt >= this.options.maxTurnMs) {
      return this.spokenMs >= this.options.minSpeechMs ? 'stop' : 'empty';
    }
    if (this.spokenMs >= this.options.minSpeechMs &&
        this.quietMs >= this.options.endSilenceMs) return 'stop';
    if (this.spokenMs < this.options.minSpeechMs &&
        this.quietMs >= this.options.endSilenceMs) {
      // A click/cough is not a conversational turn.
      this.firstVoiceAt = null;
      this.spokenMs = 0;
      this.quietMs = 0;
    }
    return 'speech';
  }
}

export function sampleRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < samples.length; i++) total += samples[i]! * samples[i]!;
  return Math.sqrt(total / samples.length);
}

function abortError(): Error {
  const error = new Error('Call recording was cancelled.');
  error.name = 'AbortError';
  return error;
}

async function acquireMicrophone(signal: AbortSignal): Promise<MediaStream> {
  if (signal.aborted) throw abortError();
  const acquire = navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    acquire.then((stream) => {
      signal.removeEventListener('abort', onAbort);
      if (settled || signal.aborted) { stream.getTracks().forEach((track) => track.stop()); return; }
      settled = true;
      resolve(stream);
    }, (error: unknown) => {
      signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

/**
 * Records one speech turn, with no upload if silence persists. The caller must not
 * record during TTS. No microphone track or AudioContext is kept after a turn.
 */
export async function captureMatorCallTurn(
  signal: AbortSignal,
  onLevel: (level: number) => void = () => {},
): Promise<Blob | null> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' ||
      typeof AudioContext === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Automatic voice calls need microphone and Web Audio support in this browser.');
  }
  const stream = await acquireMicrophone(signal);
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let recorder: MediaRecorder | null = null;
  try {
    if (signal.aborted) return null;
    context = new AudioContext();
    source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    if (context.state === 'suspended') await context.resume();
    if (signal.aborted) return null;

    const samples = new Float32Array(analyser.fftSize);
    const gate = new VoiceActivityGate();
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const media = recorder;
    const chunks: Blob[] = [];
    let bytes = 0;
    const audio = await new Promise<Blob | null>((resolve, reject) => {
      let settled = false;
      let completeWithAudio = false;
      let prevTime = performance.now();
      const cleanup = () => {
        if (timer !== null) { clearInterval(timer); timer = null; }
        signal.removeEventListener('abort', onAbort);
      };
      const finish = (includeAudio: boolean, error?: Error) => {
        if (settled) return;
        completeWithAudio = includeAudio;
        if (error) { settled = true; cleanup(); reject(error); }
        if (media.state !== 'inactive') media.stop();
        else media.onstop?.(new Event('stop'));
      };
      const onAbort = () => finish(false);
      signal.addEventListener('abort', onAbort, { once: true });
      media.ondataavailable = (event) => {
        if (event.data.size > 0) { bytes += event.data.size; chunks.push(event.data); }
        if (bytes > 16 * 1024 * 1024) finish(false, new Error('Audio turn exceeded the allowed capture size.'));
      };
      media.onerror = () => finish(false, new Error('The microphone recorder encountered an error.'));
      media.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(completeWithAudio && !signal.aborted && bytes > 0
          ? new Blob(chunks, { type: media.mimeType || 'audio/webm' }) : null);
      };
      try { media.start(200); }
      catch (error) { finish(false, error instanceof Error ? error : new Error('Could not start microphone recording.')); return; }
      timer = setInterval(() => {
        if (signal.aborted) { finish(false); return; }
        const now = performance.now();
        analyser.getFloatTimeDomainData(samples);
        const level = sampleRms(samples);
        onLevel(Math.min(1, level / 0.22));
        const verdict = gate.feed(level, now - prevTime);
        prevTime = now;
        if (verdict === 'stop') finish(true);
        else if (verdict === 'empty') finish(false);
      }, 60);
    });
    return audio;
  } finally {
    if (timer !== null) clearInterval(timer);
    source?.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (context) void context.close().catch(() => {});
    onLevel(0);
  }
}