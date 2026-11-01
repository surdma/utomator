'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  AlertCircle,
  ArrowUp,
  ArrowRight,
  FileText,
  LoaderCircle,
  Mic,
  Paperclip,
  Phone,
  Send,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import type { VoiceSession } from './use-voice-session';
import { setVoiceOnlyPreference, useVoiceOnlyPreference } from './mator-voice-preference';
import type { MatorModelOption } from './mator-api';
import { ModelSelector } from '@/components/ai-elements/model-selector';
import { Switch } from '@/components/ui/switch';
import MatorChatSettings from './mator-chat-settings';
import { cn } from '@/lib/utils';

export const ATTACH_ACCEPT =
  'image/png,image/jpeg,image/webp,.pdf,.txt,.md,.csv';

const VOICE_MISSING =
  'Microphone access is unavailable here. Switch to text to keep chatting.';

type Props = {
  voice: VoiceSession;
  pendingLabel: string | null;
  onConfirm: () => void;
  onReject?: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onAttachFile: (file?: File) => unknown | Promise<unknown>;
  busy?: boolean;
  incomplete?: boolean;
  onIncompleteContinue?: () => void;
  models?: MatorModelOption[];
  modelId?: string | null;
  onModelChange?: (modelId: string) => void;
  emptyThread?: boolean;
  startPrompt?: string | null;
};

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
      <Mic className={size === 'lg' ? 'size-5' : 'size-5'} aria-hidden="true" />
    </button>
  );
}

type PendingAttachment = {
  id: number;
  name: string;
  size: string;
  state: 'uploading' | 'done' | 'error';
};

function iconButton(
  tone: 'default' | 'active' | 'danger',
  extra?: string
): string {
  return cn(
    'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40',
    tone === 'default' &&
      'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    tone === 'active' && 'bg-teal-700 text-white hover:bg-teal-600',
    tone === 'danger' && 'text-rose-600 hover:bg-rose-50',
    extra
  );
}

export default function MatorComposer({
  voice,
  pendingLabel,
  onConfirm,
  message,
  onMessageChange,
  onSendMessage,
  onAttachFile,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
  models = [],
  modelId = null,
  onModelChange,
  emptyThread = false,
  startPrompt = null,
}: Props) {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const nextAttachmentId = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voiceOnly = useVoiceOnlyPreference();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || voiceOnly) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 116)}px`;
  }, [message, voiceOnly]);

  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    inputRef.current?.blur();
    const chip: PendingAttachment = {
      id: nextAttachmentId.current++,
      name: file.name,
      size: fileSizeLabel(file.size),
      state: 'uploading',
    };
    setPending((current) => [...current, chip]);
    try {
      const result = await onAttachFile(file);
      if (result === null) throw new Error('File upload failed');
      setPending((current) =>
        current.map((item) =>
          item.id === chip.id ? { ...item, state: 'done' } : item
        )
      );
    } catch {
      setPending((current) =>
        current.map((item) =>
          item.id === chip.id ? { ...item, state: 'error' } : item
        )
      );
      return;
    }
    window.setTimeout(() => {
      setPending((current) => current.filter((item) => item.id !== chip.id));
    }, 1200);
  };

  /* ── Voice-only deck ─────────────────────────────────────────── */
  if (voiceOnly) {
    const caption =
      voice.interim ||
      (voice.listening ? 'Listening…' : 'Say what you want changed.');
    const status =
      voice.support === 'unsupported'
        ? VOICE_MISSING
        : voice.listening
          ? 'Tap again to transcribe'
          : voice.speaking
            ? 'Mator is speaking'
            : 'Tap to speak';
    return (
      <div
        data-testid="mator-composer"
        data-mode="voice-only"
        className="shrink-0 border-t border-slate-200 bg-gradient-to-b from-slate-50/60 to-white px-4 pt-3 pb-3"
      >
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-1">
          <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-teal-800">
            <Phone className="size-3.5" aria-hidden="true" />
            Voice mode
          </span>
          <div className="inline-flex min-w-0 shrink-0 flex-nowrap items-center gap-0.5">
            <button type="button" aria-label="Attach a file during voice conversation" data-testid="mator-voice-attach" onClick={() => inputRef.current?.click()} className={iconButton('default')}>
              <Paperclip className="size-4" aria-hidden="true" />
            </button>
            <input ref={inputRef} type="file" accept={ATTACH_ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1} onChange={(event) => { void attach(event.target.files); event.target.value = ''; }} />
            <MatorChatSettings disabled={busy} />
            <span className="inline-flex size-11 shrink-0 items-center justify-center" title="Switch to text conversation">
              <Switch checked={voiceOnly} onCheckedChange={setVoiceOnlyPreference} aria-label="Voice-only conversation" data-testid="mator-voice-switch" />
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-col items-center gap-2 pb-1">
          <p
            aria-live="polite"
            className="min-h-11 w-full text-center text-base leading-snug font-medium text-slate-900"
          >
            {caption}
          </p>
          <button
            type="button"
            data-testid="mator-voice-listening"
            onClick={() => {
              if (voice.support === 'unsupported') return;
              voice.toggleListen();
            }}
            disabled={voice.support === 'unsupported'}
            className={cn(
              'relative inline-flex size-14 cursor-pointer items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transform-none',
              voice.support === 'unsupported' && 'opacity-40'
            )}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? 'Stop listening' : 'Speak to Mator'}
            style={{ backgroundColor: voice.listening ? '#b91c1c' : '#115e59' }}
          >
            {voice.listening && (
              <span
                className="mator-listen-ring pointer-events-none absolute inset-0 rounded-full border-2 border-teal-600"
                aria-hidden="true"
              />
            )}
            {voice.listening ? (
              <Square className="size-5" aria-hidden="true" />
            ) : (
              <Mic className="size-5" aria-hidden="true" />
            )}
          </button>
          <p className="text-[11px] text-slate-500">{status}</p>
          {voice.error && (
            <p role="alert" className="text-[11px] text-rose-700">
              {voice.error}
            </p>
          )}
        </div>
        {pendingLabel && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50/80 px-3 py-2 text-[11px] font-semibold text-orange-900">
            <span className="truncate">Not staged · {pendingLabel}</span>
            <button
              type="button"
              data-testid="mator-stage-confirm-compact"
              disabled={busy}
              onClick={onConfirm}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-orange-700 px-2 text-[11px] font-bold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-3" aria-hidden="true" />
              Stage this
            </button>
          </div>
        )}
        {voiceOnly && incomplete && (
          <IncompleteBanner onContinue={onIncompleteContinue} busy={busy} />
        )}
      </div>
    );
  }

  /* ── Text-first deck ─────────────────────────────────────────── */
  const canSend = Boolean(message.trim()) && !busy;
  const showSuggestions = emptyThread && Boolean(startPrompt);

  return (
    <div
      data-testid="mator-composer"
      data-mode="text"
      className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-3"
    >
      {incomplete && (
        <IncompleteBanner onContinue={onIncompleteContinue} busy={busy} />
      )}
      {showSuggestions && (
        <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
          <button
            type="button"
            data-testid="mator-start-prompt"
            onClick={() => onMessageChange(startPrompt!)}
            className="min-h-9 cursor-pointer rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-teal-400 hover:bg-teal-50/60 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {startPrompt!.slice(0, 42)}
            {startPrompt!.length > 42 ? '…' : ''}
          </button>
        </div>
      )}
      <form
        ref={formRef}
        onSubmit={onSendMessage}
        className="flex min-w-0 flex-col gap-1.5"
      >
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-1.5 pt-1 pb-1.5 shadow-[inset_0_1px_2px_rgba(15,23,42,.03)] transition-colors focus-within:border-teal-600/70 focus-within:ring-2 focus-within:ring-teal-700/10">
          {pending.length > 0 && (
            <div className="mator-snap-x flex flex-wrap gap-1.5 px-1.5 pt-1 pb-1.5">
              {pending.map((item) => (
                <Chip
                  key={item.id}
                  attachment={item}
                  onRemove={() =>
                    setPending((current) =>
                      current.filter((c) => c.id !== item.id)
                    )
                  }
                />
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={message}
            rows={1}
            id="mator-composer-input"
            aria-label="Message Mator"
            data-testid="mator-input"
            disabled={busy}
            placeholder="Message Mator…"
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) formRef.current?.requestSubmit();
              }
            }}
            className="max-h-29 w-full resize-none bg-transparent px-2.5 py-2 text-sm leading-5 text-slate-900 placeholder:text-slate-400 focus-visible:outline-none disabled:opacity-60"
          />
          <div className="flex min-w-0 flex-nowrap items-center gap-0.5 px-0.5 pb-0.5">
            <button
              type="button"
              aria-label="Attach a file"
              data-testid="mator-attach"
              onClick={() => inputRef.current?.click()}
              className={iconButton('default')}
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ATTACH_ACCEPT}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                void attach(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label={voice.listening ? 'Stop listening' : 'Speak to Mator'}
              aria-pressed={voice.listening}
              data-testid="mator-mic"
              disabled={voice.support === 'unsupported' || busy}
              onClick={voice.toggleListen}
              className={iconButton(voice.listening ? 'active' : 'default')}
            >
              {voice.listening ? (
                <Square className="size-3.5" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
            </button>
            {voice.listening && (
              <span
                aria-live="polite"
                className="min-w-0 flex-1 truncate text-[11px] font-medium text-teal-800"
              >
                {voice.interim || 'Listening…'}
              </span>
            )}
            <div className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-0.5">
              <span className="inline-flex size-11 shrink-0 items-center justify-center" title="Voice-only conversation">
                <Switch checked={voiceOnly} onCheckedChange={setVoiceOnlyPreference} aria-label="Voice-only conversation" data-testid="mator-voice-switch" />
              </span>
              <MatorChatSettings disabled={busy} />
              {models.length > 0 && (
                <ModelSelector
                  models={models}
                  currentId={modelId}
                  onSelect={(id) => onModelChange?.(id)}
                  disabled={busy}
                  compact
                  className="relative"
                />
              )}
              <button
                type="submit"
                aria-label={busy ? 'Sending' : 'Send message'}
                data-testid="mator-send"
                disabled={!canSend}
                className={cn(
                  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed',
                  canSend
                    ? 'bg-teal-800 text-white hover:bg-teal-700'
                    : 'bg-slate-100 text-slate-300'
                )}
              >
                {busy ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowUp className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1.5">
          {pendingLabel ? (
            <div
              data-testid="pending-stage"
              className="flex min-h-8 flex-1 items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50/80 px-2.5 py-1 text-[11px] font-semibold text-orange-900"
            >
              <span className="truncate">Not staged · {pendingLabel}</span>
              <button
                type="button"
                data-testid="mator-stage-confirm-compact"
                disabled={busy}
                onClick={onConfirm}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-orange-700 px-2 text-[11px] font-bold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowRight className="size-3" aria-hidden="true" />
                Stage this
              </button>
            </div>
          ) : (
            <span className="hidden truncate text-[10px] text-slate-400 select-none sm:flex sm:items-center sm:gap-1">
              <Volume2 className="size-3" aria-hidden="true" />
              Enter sends · Shift+Enter adds a line
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function IncompleteBanner({
  onContinue,
  busy,
}: {
  onContinue?: () => void;
  busy?: boolean;
}) {
  return (
    <div
      data-testid="incomplete-banner"
      className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900"
    >
      <span className="min-w-0 truncate">Mator left this run incomplete.</span>
      <button
        type="button"
        data-testid="mator-incomplete-continue"
        disabled={busy}
        onClick={onContinue}
        className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-amber-700 px-2 text-[11px] font-bold text-white hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowRight className="size-3" aria-hidden="true" />
        Continue
      </button>
    </div>
  );
}

function Chip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const isUploading = attachment.state === 'uploading';
  return (
    <Attachment
      size="sm"
      state={attachment.state}
      role="listitem"
      className="pr-1.5"
    >
      <AttachmentMedia variant="icon">
        {isUploading ? (
          <LoaderCircle
            className="size-3.5 animate-spin text-teal-700"
            aria-hidden="true"
          />
        ) : attachment.state === 'error' ? (
          <AlertCircle className="size-3.5 text-rose-600" aria-hidden="true" />
        ) : (
          <FileText className="size-3.5" aria-hidden="true" />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{attachment.name}</AttachmentTitle>
        <AttachmentDescription>
          {attachment.state === 'error'
            ? 'Upload failed. Try again.'
            : isUploading
              ? `Uploading · ${attachment.size}`
              : attachment.size}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentAction
        aria-label={`Dismiss status for ${attachment.name}`}
        onClick={onRemove}
        className="size-6"
      >
        <X className="size-3.5" aria-hidden="true" />
      </AttachmentAction>
    </Attachment>
  );
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
