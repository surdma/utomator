export type VoiceScope = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export function readVoiceSupport(scope: object | null | undefined) {
  try {
    if (!scope) return 'unsupported' as const;
    const candidate = scope as VoiceScope;
    if (
      typeof candidate.SpeechRecognition === 'function' ||
      typeof candidate.webkitSpeechRecognition === 'function'
    ) {
      return 'ready' as const;
    }
    return 'unsupported' as const;
  } catch {
    return 'unsupported' as const;
  }
}

/**
 * A permission dialog can resolve after recording cancellation or unmount.
 * Never retain the late microphone stream.
 */
export async function acquireCurrentVoiceStream<
  T extends { getTracks(): Array<{ stop(): void }> },
>(request: () => Promise<T>, isCurrent: () => boolean): Promise<T | null> {
  const stream = await request();
  if (isCurrent()) return stream;
  for (const track of stream.getTracks()) track.stop();
  return null;
}

/** A transcript may only be delivered by the recording that is still current. */
export function createVoiceDeliveryGate() {
  let epoch = 0;
  return {
    start: () => ++epoch,
    invalidate: () => {
      epoch += 1;
    },
    isCurrent: (token: number) => token === epoch,
  };
}
