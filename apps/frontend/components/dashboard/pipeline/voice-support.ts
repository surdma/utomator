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
