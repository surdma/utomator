'use client';

import { useRef, type FormEvent } from 'react';
import { Mic, Paperclip, Send, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/automate-card';
import type { VoiceSession } from './use-voice-session';

const VOICE_MISSING =
  'Voice needs Chrome or Edge on this machine. Type a command instead.';

const ATTACH_ACCEPT =
  'image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm';

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
      className={`relative inline-flex ${size === 'lg' ? 'size-14' : 'size-12'} cursor-pointer items-center justify-center rounded-full bg-teal-800 text-white shadow-sm hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none`}
    >
      {listening && (
        <span
          className="mator-listen-ring pointer-events-none absolute inset-0 rounded-full border-2 border-teal-600"
          aria-hidden="true"
        />
      )}
      <Mic className="size-5" aria-hidden="true" />
    </button>
  );
}

export default function VoiceDeck({
  voice,
  pendingLabel,
  onConfirm,
  onReject,
  message,
  onMessageChange,
  onSendMessage,
  onAttachFile,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
}: {
  voice: VoiceSession;
  pendingLabel: string | null;
  onConfirm: () => void;
  onReject?: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onAttachFile: (file?: File) => void | Promise<void>;
  busy?: boolean;
  incomplete?: boolean;
  onIncompleteContinue?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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
      className="mt-3 flex shrink-0 flex-col gap-3 border-t border-slate-200 pt-3"
    >
      <p
        aria-live="polite"
        className="min-h-10 w-full text-center text-sm leading-snug font-medium text-slate-800"
      >
        {caption}
      </p>

      {incomplete && onIncompleteContinue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            Reply incomplete — continue from where it stopped.
          </p>
          <Button
            type="button"
            variant="secondary"
            data-testid="mator-incomplete-continue"
            disabled={busy}
            onClick={onIncompleteContinue}
            className="mt-2 w-full"
          >
            Continue
          </Button>
        </div>
      )}

      {pendingLabel && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-900">
            Staged · {pendingLabel}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="primary"
              data-testid="mator-stage-confirm"
              disabled={busy}
              onClick={onConfirm}
              className="flex-1"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Confirm
            </Button>
            {onReject && (
              <Button
                type="button"
                variant="danger"
                data-testid="mator-stage-reject"
                disabled={busy}
                onClick={onReject}
                className="flex-1"
              >
                <X className="size-3.5" aria-hidden="true" />
                Reject
              </Button>
            )}
          </div>
        </div>
      )}

      {voice.error && (
        <p role="alert" className="text-center text-xs text-rose-700">
          {voice.error}
        </p>
      )}

      <form
        onSubmit={onSendMessage}
        className="flex items-end gap-2"
        aria-label="Mator composer"
      >
        <input
          ref={fileRef}
          type="file"
          accept={ATTACH_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void onAttachFile(file);
          }}
        />
        <button
          type="button"
          aria-label="Attach file"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="mator-composer-input">
          Message Mator
        </label>
        <textarea
          id="mator-composer-input"
          rows={2}
          value={message}
          disabled={busy}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Type a change, or attach a file…"
          className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
        />
        <VoiceMicButton
          listening={voice.listening}
          disabled={voice.support === 'unsupported' || busy}
          onClick={voice.toggleListen}
          size="md"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={busy || !message.trim()}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
      <p className="text-center text-[11px] text-slate-500">{status}</p>
    </div>
  );
}
