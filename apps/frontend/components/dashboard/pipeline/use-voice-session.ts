'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { synthesizeMatorSpeech, transcribeMatorAudio } from './mator-api';
import { readVoiceSupport } from './voice-support';
import { playMatorSpeechChunks } from './mator-speech-chunks';

type RecognitionResult = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type RecognitionEvent = {
  results: ArrayLike<RecognitionResult>;
  error?: string;
};

type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  settled?: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => BrowserRecognition;

const VOICE_MISSING =
  'Voice needs Chrome or Edge on this machine. Type a command instead.';
const VOICE_RETRY =
  "Voice didn't catch that. Try the mic again, or type a correction.";
const MIC_BLOCKED = 'Allow the microphone, or type a correction.';

let releaseActive: (() => void) | null = null;

function subscribeVoice() {
  return () => {};
}

function clientVoiceSupport() {
  if (readVoiceSupport(window) === 'ready') return 'ready' as const;
  if (
    typeof MediaRecorder === 'function' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  ) {
    return 'ready' as const;
  }
  return 'unsupported' as const;
}

function serverVoiceSupport() {
  return 'pending' as const;
}

function claim(release: () => void) {
  const previous = releaseActive;
  releaseActive = release;
  previous?.();
}

function recognitionConstructor(scope: Window) {
  const candidate = scope as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return (
    candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
  );
}

export type VoiceSession = {
  support: 'pending' | 'ready' | 'unsupported';
  listening: boolean;
  speaking: boolean;
  interim: string;
  muted: boolean;
  error: string | null;
  toggleListen: () => void;
  toggleMute: () => void;
  speak: (text: string, force?: boolean) => void;
};

export function useVoiceSession({
  onFinal,
  silenceMs = 1200,
}: {
  onFinal: (transcript: string) => void;
  silenceMs?: number;
}): VoiceSession {
  const support = useSyncExternalStore(
    subscribeVoice,
    clientVoiceSupport,
    serverVoiceSupport
  );
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  const mutedRef = useRef(false);
  const silenceRef = useRef(silenceMs);
  const stopRef = useRef<((emit: boolean) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderStopRef = useRef<(() => void) | null>(null);
  const speechEpochRef = useRef(0);
  const speechAbortRef = useRef<AbortController | null>(null);
  const playbackCancelRef = useRef<(() => void) | null>(null);
  const browserRetryRef = useRef(false);
  const cancelRecorderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onFinalRef.current = onFinal;
    mutedRef.current = muted;
    silenceRef.current = silenceMs;
  }, [onFinal, muted, silenceMs]);

  function stopSpeech() {
    speechEpochRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    playbackCancelRef.current?.();
    playbackCancelRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function speakWithBrowser(clean: string, epoch: number): Promise<void> {
    return new Promise((resolve) => {
      if (speechEpochRef.current !== epoch || typeof window === 'undefined' ||
          !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      const english = window.speechSynthesis.getVoices().find((voice) =>
        voice.lang.toLowerCase().startsWith('en')
      );
      if (english) utterance.voice = english;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (playbackCancelRef.current === finish) playbackCancelRef.current = null;
        resolve();
      };
      playbackCancelRef.current = finish;
      utterance.onstart = () => {
        if (speechEpochRef.current === epoch) setSpeaking(true);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }

  function playAudio(blob: Blob, epoch: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (speechEpochRef.current !== epoch) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      let settled = false;
      const finish = (problem?: Error) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        if (audioRef.current === audio) audioRef.current = null;
        if (playbackCancelRef.current === cancel) playbackCancelRef.current = null;
        audio.pause();
        URL.revokeObjectURL(url);
        if (problem) reject(problem);
        else resolve();
      };
      const cancel = () => finish();
      playbackCancelRef.current = cancel;
      audio.onplay = () => {
        if (speechEpochRef.current === epoch) setSpeaking(true);
      };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('Audio playback failed'));
      void audio.play().catch((error: unknown) =>
        finish(error instanceof Error ? error : new Error('Audio playback failed'))
      );
    });
  }

  function speak(text: string, force = false) {
    if (typeof window === 'undefined' || (mutedRef.current && !force)) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    stopSpeech();
    const epoch = speechEpochRef.current;
    const controller = new AbortController();
    speechAbortRef.current = controller;
    void playMatorSpeechChunks(clean, {
      synthesize: (segment) => synthesizeMatorSpeech(segment, controller.signal),
      play: (blob) => playAudio(blob, epoch),
      fallback: (remaining) => speakWithBrowser(remaining, epoch),
      isCancelled: () => epoch !== speechEpochRef.current || controller.signal.aborted ||
        (mutedRef.current && !force),
    }).catch(() => {
      if (speechEpochRef.current === epoch) setError('Voice playback failed. The written reply is still available.');
    }).finally(() => {
      if (speechEpochRef.current !== epoch) return;
      if (speechAbortRef.current === controller) speechAbortRef.current = null;
      setSpeaking(false);
    });
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next && typeof window !== 'undefined') stopSpeech();
  }

  useEffect(() => () => {
    speechEpochRef.current += 1;
    speechAbortRef.current?.abort();
    playbackCancelRef.current?.();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    cancelRecorderRef.current?.();
    stopRef.current?.(false);
  }, []);

  async function beginGroqRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    let stopRecorder: (() => void) | null = null;
    let cancelRecording: (() => void) | null = null;
    const release = () => {
      if (recorderStopRef.current === stopRecorder) recorderStopRef.current = null;
      if (cancelRecorderRef.current === cancelRecording) cancelRecorderRef.current = null;
      if (releaseActive === cancelRecording) releaseActive = null;
      stream.getTracks().forEach((track) => track.stop());
      setListening(false);
      setInterim('');
    };
    recorder.onstop = () => {
      release();
      const blob = new Blob(chunks, {
        type: recorder.mimeType || 'audio/webm',
      });
      if (!blob.size) return;
      setInterim('Transcribing…');
      void transcribeMatorAudio(blob)
        .then((text) => {
          setInterim('');
          if (text) onFinalRef.current(text);
          else setError(VOICE_RETRY);
        })
        .catch(() => {
          setInterim('');
          browserRetryRef.current = Boolean(recognitionConstructor(window));
          setError(browserRetryRef.current
            ? 'Groq transcription failed. Tap the microphone again to re-record using browser speech recognition.'
            : 'Groq transcription failed. Retry the microphone or type your request.');
        });
    };
    stopRecorder = () => {
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    };
    recorderStopRef.current = stopRecorder;
    cancelRecording = () => {
      recorder.onstop = null; // A canceled recording must not submit audio.
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    };
    cancelRecorderRef.current = cancelRecording;
    claim(cancelRecording);
    recorder.start();
    setListening(true);
    setError(null);
    setInterim('Listening… tap again to transcribe');
  }

  function begin() {
    stopSpeech(); // Barge-in cancels an active spoken reply.
    // Web Speech cannot transcribe a saved MediaRecorder Blob.
    // After a Groq error, the next explicit tap starts a new recording.
    const tryBrowser = browserRetryRef.current && Boolean(recognitionConstructor(window));
    browserRetryRef.current = false;
    if (!tryBrowser &&
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    ) {
      void beginGroqRecording().catch(() => {
        setListening(false);
        setError(MIC_BLOCKED);
      });
      return;
    }
    const Ctor = recognitionConstructor(window);
    if (!Ctor) {
      setError(VOICE_MISSING);
      return;
    }
    stopSpeech();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finals = '';
    let timer = 0;
    const finish = (emit: boolean) => {
      if (recognition.settled) return;
      recognition.settled = true;
      if (releaseActive === release) releaseActive = null;
      window.clearTimeout(timer);
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
      setInterim('');
      setListening(false);
      if (stopRef.current === finish) stopRef.current = null;
      const text = finals.trim();
      if (emit && text) onFinalRef.current(text);
    };
    const release = () => finish(false);
    stopRef.current = finish;
    recognition.onresult = (event) => {
      if (recognition.settled) return;
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const piece = result?.[0]?.transcript ?? '';
        if (result?.isFinal) finalText += piece;
        else interimText += piece;
      }
      finals = finalText;
      setInterim(`${finalText} ${interimText}`.replace(/\s+/g, ' ').trim());
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(true), silenceRef.current);
    };
    recognition.onerror = (event) => {
      if (recognition.settled || event.error === 'aborted') return;
      recognition.settled = true;
      if (releaseActive === release) releaseActive = null;
      window.clearTimeout(timer);
      setListening(false);
      setInterim('');
      if (event.error === 'no-speech') return;
      setError(event.error === 'not-allowed' ? MIC_BLOCKED : VOICE_RETRY);
    };
    recognition.onend = () => {
      if (!recognition.settled) finish(true);
    };
    claim(release);
    try {
      recognition.start();
      setListening(true);
      setError(null);
      setInterim('');
    } catch {
      finish(false);
      setError(VOICE_RETRY);
    }
  }

  function toggleListen() {
    if (listening) {
      if (recorderStopRef.current) recorderStopRef.current();
      else stopRef.current?.(true);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      if (clientVoiceSupport() === 'unsupported') {
        setError(VOICE_MISSING);
        return;
      }
      begin();
    } catch {
      setListening(false);
      setError(VOICE_RETRY);
    }
  }

  return {
    support,
    listening,
    speaking,
    interim,
    muted,
    error,
    toggleListen,
    toggleMute,
    speak,
  };
}
