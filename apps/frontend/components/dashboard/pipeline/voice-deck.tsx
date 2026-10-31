'use client';

import type { FormEvent } from 'react';
import { Mic, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/automate-card';
import type { VoiceSession } from './use-voice-session';

const VOICE_MISSING =
  'Voice needs Chrome or Edge on this machine. Type a command instead.';

export function VoiceMicButton({
  listening,
  disabled,
  onClick,
  label = 'Speak to Mator',
  size = 'lg',
}: {
  listening: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  size?: 'lg' | 'md';
}) {
  return (
    <button
      type="button"
      data-testid={size === 'lg' ? 'mator-mic' : 'annotation-mic'}
      aria-label={listening ? 'Stop listening' : label}
      aria-pressed={listening}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex ${size === 'lg' ? 'size-16' : 'size-12'} cursor-pointer items-center justify-center rounded-full bg-teal-800 text-white shadow-sm hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none`}
    >
      {listening && (
        <span
          className="mator-listen-ring pointer-events-none absolute inset-0 rounded-full border-2 border-teal-600"
          aria-hidden="true"
        />
      )}
      <Mic className="size-6" aria-hidden="true" />
    </button>
  );
}

export default function VoiceDeck({
  voice,
  pendingLabel,
  onConfirm,
  message,
  onMessageChange,
  onSendMessage,
  onAttachImage,
}: {
  voice: VoiceSession;
  pendingLabel: string | null;
  onConfirm: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onAttachImage: (file?: File) => void | Promise<void>;
}) {
  const caption =
    voice.interim ||
    (voice.listening ? 'Listening…' : 'Say what you want changed.');
  const status =
    voice.support === 'unsupported'
      ? VOICE_MISSING
      : voice.listening
        ? 'Listening… tap to stop'
        : voice.speaking
          ? 'Mator is speaking'
          : 'Tap to speak';
  return (
    <div
      data-testid="mator-voice-deck"
      className="mt-4 flex shrink-0 flex-col items-center gap-3 border-t border-slate-200 pt-4"
    >
      <p
        aria-live="polite"
        className="min-h-14 w-full text-center text-lg leading-snug font-medium text-slate-900"
      >
        {caption}
      </p>
      {pendingLabel && (
        <p className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
          Not staged · {pendingLabel}
        </p>
      )}
      {voice.error && (
        <p role="alert" className="text-center text-xs text-rose-700">
          {voice.error}
        </p>
      )}
      <VoiceMicButton
        listening={voice.listening}
        disabled={voice.support === 'unsupported'}
        onClick={voice.toggleListen}
      />
      <p className="text-center text-xs text-slate-500">{status}</p>
      {pendingLabel && (
        <Button
          type="button"
          variant="primary"
          data-testid="mator-stage"
          onClick={onConfirm}
          className="w-full"
        >
          Stage this
        </Button>
      )}
    
    </div>
  );
}
