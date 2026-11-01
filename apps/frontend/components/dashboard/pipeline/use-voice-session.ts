'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { synthesizeMatorSpeech, transcribeMatorAudio } from './mator-api';
import { readVoiceSupport } from './voice-support';

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

  useEffect(() => {
    onFinalRef.current = onFinal;
    mutedRef.current = muted;
    silenceRef.current = silenceMs;
  }, [onFinal, muted, silenceMs]);

  function speakWithBrowser(clean: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function speak(text: string, force = false) {
    if (typeof window === 'undefined') return;
    if (mutedRef.current && !force) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    void synthesizeMatorSpeech(clean)
      .then((blob) => {
        if (mutedRef.current && !force) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          speakWithBrowser(clean);
        };
        return audio.play();
      })
      .catch(() => {
        try {
          speakWithBrowser(clean);
        } catch {
          setSpeaking(false);
        }
      });
  }

  function toggleMute() {
    setMuted((value) => {
      const next = !value;
      if (next && typeof window !== 'undefined') {
        audioRef.current?.pause();
        audioRef.current = null;
        window.speechSynthesis?.cancel();
        setSpeaking(false);
      }
      return next;
    });
  }

  async function beginGroqRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const release = () => {
      if (recorderStopRef.current === release) recorderStopRef.current = null;
      if (releaseActive === release) releaseActive = null;
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
          setError(VOICE_RETRY);
        });
    };
    recorderStopRef.current = () => {
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    };
    claim(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
    recorder.start();
    setListening(true);
    setError(null);
    setInterim('Listening… tap again to transcribe');
  }

  function begin() {
    if (
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
    window.speechSynthesis?.cancel();
    setSpeaking(false);
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
