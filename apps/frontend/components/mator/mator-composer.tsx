'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowUp,
  ArrowRight,
  LoaderCircle,
  Mic,
  Paperclip,
  Phone,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { VoiceSession } from './use-voice-session';
import MatorAttachmentPreview from './mator-attachment-preview';
import type { MatorCanvasMarker } from './mator-attachment-canvas';
import { setVoiceOnlyPreference, useVoiceOnlyPreference } from './mator-voice-preference';
import type { MatorModelOption, MatorSettingsMasked } from './mator-api';
import { ModelSelector } from './elements/model-selector';
import { Switch } from '@/components/ui/switch';
import MatorChatSettings from './mator-chat-settings';
import { cn } from '@/lib/utils';
import {
  fileSizeLabel,
  iconButton,
  supportedFile,
} from './chat/mator-composer-format';

export const ATTACH_ACCEPT = 'image/*,.txt,.md,.markdown,.readme,README';

const VOICE_MISSING =
  'Microphone access is unavailable here. Switch to text to keep chatting.';

type Props = {
  voice: VoiceSession;
  operatorPendingLabel?: string | null;
  onConfirmOperator?: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onUploadFile?: (file: File) => Promise<string>;
  onSendText?: (text: string, attachmentIds?: string[]) => Promise<boolean | void> | void;
  onSaveMarkers?: (
    attachmentId: string,
    markers: MatorCanvasMarker[],
    reviewId?: string
  ) => void | Promise<unknown>;
  /** Opens the full YAML-driven review studio for a pending draft image. */
  onAnnotateDraft?: (
    file: File,
    note?: string
  ) => Promise<{ reviewId: string } | null>;
  onPendingAssetsChange?: (count: number) => void;
  busy?: boolean;
  incomplete?: boolean;
  onIncompleteContinue?: () => void;
  models?: MatorModelOption[];
  modelId?: string | null;
  onModelChange?: (modelId: string) => void;
  onSettingsSaved?: (settings: MatorSettingsMasked) => void;
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
  file: File;
  name: string;
  size: string;
  imageSrc: string | null;
  markers: MatorCanvasMarker[];
  /** Saved review (annotation YAML) created from this draft image. */
  reviewId?: string;
  uploadedId?: string;
  state: 'ready' | 'uploading' | 'error';
};

export default function MatorComposer({
  voice,
  operatorPendingLabel = null,
  onConfirmOperator,
  message,
  onMessageChange,
  onSendMessage,
  onUploadFile,
  onSendText,
  onSaveMarkers,
  onAnnotateDraft,
  onPendingAssetsChange,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
  models = [],
  modelId = null,
  onModelChange,
  onSettingsSaved,
  emptyThread = false,
  startPrompt = null,
}: Props) {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [annotateError, setAnnotateError] = useState('');
  const previewUrls = useRef(new Set<string>());
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

  useEffect(() => {
    onPendingAssetsChange?.(pending.length);
  }, [pending.length, onPendingAssetsChange]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  const attach = (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const accepted = selected.filter(supportedFile);
    // The backend accepts at most 12 attachment IDs per message. Reject the
    // selection before allocating previews or uploading any of its files.
    if (pending.length + accepted.length > 12) {
      setDraftError('You can attach up to 12 files to one message.');
      return;
    }
    if (accepted.length !== selected.length) {
      setDraftError('Supported assets are raster images, TXT and README files.');
    } else {
      setDraftError('');
    }
    const rows = accepted.map((file) => {
      const imageSrc = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      if (imageSrc) previewUrls.current.add(imageSrc);
      return {
        id: nextAttachmentId.current++,
        file, name: file.name, size: fileSizeLabel(file.size),
        imageSrc, markers: [], state: 'ready' as const,
      };
    });
    setPending((current) => [...current, ...rows]);
    inputRef.current?.blur();
  };

  const removeDraft = (id: number) => {
    setPending((current) => {
      const removed = current.find((asset) => asset.id === id);
      if (removed?.imageSrc) {
        URL.revokeObjectURL(removed.imageSrc);
        previewUrls.current.delete(removed.imageSrc);
      }
      return current.filter((asset) => asset.id !== id);
    });
  };

  const sendDraft = async () => {
    if (submitting || busy || !pending.length || !onUploadFile || !onSendText) return;
    setSubmitting(true);
    setDraftError('');
    try {
      const ids: string[] = [];
      for (const asset of pending) {
        let id = asset.uploadedId;
        if (!id) {
          setPending((current) => current.map((row) => row.id === asset.id ? { ...row, state: 'uploading' } : row));
          id = await onUploadFile(asset.file);
          if (!id) throw Error('Could not upload ' + asset.name);
          asset.uploadedId = id;
          setPending((current) => current.map((row) => row.id === asset.id ? { ...row, uploadedId: id, state: 'ready' } : row));
        }
        if ((asset.markers.length || asset.reviewId) && onSaveMarkers) {
          await onSaveMarkers(id, asset.markers, asset.reviewId);
        }
        ids.push(id);
      }
      const sent = await onSendText(message.trim(), ids);
      if (sent === false) throw Error('Could not send assets. Your draft is preserved.');
      setPending([]);
      setAnnotateError('');
      for (const asset of pending) {
        if (asset.imageSrc) {
          URL.revokeObjectURL(asset.imageSrc);
          previewUrls.current.delete(asset.imageSrc);
        }
      }
      onMessageChange('');
    } catch (cause) {
      setPending((current) => current.map((row) => row.state === 'uploading' ? { ...row, state: 'error' } : row));
      setDraftError(cause instanceof Error ? cause.message : 'Could not send assets');
    } finally {
      setSubmitting(false);
    }
  };

  const annotateDraftRow = async (asset: PendingAttachment) => {
    if (!onAnnotateDraft) return;
    setAnnotateError('');
    try {
      const result = await onAnnotateDraft(
        asset.file,
        message.trim().slice(0, 1500) || undefined
      );
      if (result?.reviewId) {
        setPending((current) => current.map((row) =>
          row.id === asset.id ? { ...row, reviewId: result.reviewId } : row
        ));
      }
    } catch (cause) {
      setAnnotateError(
        cause instanceof Error ? cause.message : 'Could not open the annotation studio'
      );
    }
  };

  const gallery = pending.length ? (
    <div className="min-w-0 px-1.5 py-1.5">
      <div data-testid="mator-pending-gallery" className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4" role="list" aria-label="Assets ready to send">
        {pending.map((asset) => (
          <div key={asset.id} role="listitem" className="relative w-fit">
            <MatorAttachmentPreview
              attachmentId={asset.uploadedId ?? `draft-${asset.id}`}
              filename={asset.name}
              mime={asset.file.type || (asset.imageSrc ? 'image/png' : 'text/plain')}
              imageSrc={asset.imageSrc}
              markers={asset.markers}
              reviewId={asset.reviewId}
              onAnnotateFull={
                onAnnotateDraft && asset.file.type.startsWith('image/')
                  ? () => annotateDraftRow(asset)
                  : undefined
              }
            />
            <button type="button" aria-label={`Remove ${asset.name}`} onClick={() => removeDraft(asset.id)} className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-slate-800 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
              <X className="size-3" aria-hidden="true" />
            </button>
            {asset.state !== 'ready' && <span className="block text-[10px] text-slate-600">{asset.state}</span>}
          </div>
        ))}
      </div>
      {annotateError && (
        <p role="alert" data-testid="mator-annotate-error" className="px-1 pt-1 text-xs text-rose-700">
          {annotateError}
        </p>
      )}
    </div>
  ) : null;


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
            <input ref={inputRef} type="file" multiple accept={ATTACH_ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1} onChange={(event) => { attach(event.target.files); event.target.value = ''; }} />
            <MatorChatSettings disabled={busy} onSettingsSaved={onSettingsSaved} />
            <span className="inline-flex size-11 shrink-0 items-center justify-center" title="Switch to text conversation">
              <Switch checked={voiceOnly} onCheckedChange={setVoiceOnlyPreference} aria-label="Voice-only conversation" data-testid="mator-voice-switch" />
            </span>
          </div>
        </div>
        {gallery}
        {pending.length > 0 && (
          <div className="mt-2 flex items-end gap-2">
            <input type="text" value={message} onChange={(event) => onMessageChange(event.target.value)} aria-label="Caption for assets" placeholder="Add a caption or prompt…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
            <button type="button" data-testid="mator-send" onClick={() => void sendDraft()} disabled={submitting || busy} className="min-h-11 rounded-xl bg-teal-800 px-3 text-sm font-semibold text-white disabled:opacity-50">Send assets</button>
          </div>
        )}
        {draftError && <p role="alert" className="text-xs text-rose-700">{draftError}</p>}
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
        {operatorPendingLabel && onConfirmOperator && (
          <OperatorPendingApproval label={operatorPendingLabel} onConfirm={onConfirmOperator} busy={busy} />
        )}
        {voiceOnly && incomplete && (
          <IncompleteBanner onContinue={onIncompleteContinue} busy={busy} />
        )}
      </div>
    );
  }

  /* ── Text-first deck ─────────────────────────────────────────── */
  const canSend = Boolean(message.trim() || pending.length) && !busy && !submitting;
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
      {operatorPendingLabel && onConfirmOperator && (
        <OperatorPendingApproval label={operatorPendingLabel} onConfirm={onConfirmOperator} busy={busy} />
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
        onSubmit={(event) => {
          if (pending.length) {
            event.preventDefault();
            void sendDraft();
          } else onSendMessage(event);
        }}
        className="flex min-w-0 flex-col gap-1.5"
      >
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-1.5 pt-1 pb-1.5 shadow-[inset_0_1px_2px_rgba(15,23,42,.03)] transition-colors focus-within:border-teal-600/70 focus-within:ring-2 focus-within:ring-teal-700/10">
          {gallery}
          {draftError && <p role="alert" className="px-2 text-xs text-rose-700">{draftError}</p>}
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
              multiple
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                attach(event.target.files);
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
              <MatorChatSettings disabled={busy} onSettingsSaved={onSettingsSaved} />
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
        <div className="flex items-center px-1.5">
          <span className="hidden truncate text-[10px] text-slate-400 select-none sm:flex sm:items-center sm:gap-1">
            <Volume2 className="size-3" aria-hidden="true" />
            Enter sends · Shift+Enter adds a line
          </span>
        </div>
      </form>
    </div>
  );
}

function OperatorPendingApproval({
  label,
  onConfirm,
  busy,
}: {
  label: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div
      data-testid="operator-pending-approval"
      role="status"
      className="mb-2 flex w-fit max-w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
    >
      <span className="min-w-0 max-w-48 truncate" title={label}>Local command: {label}</span>
      <button
        type="button"
        data-testid="operator-confirm-pending"
        onClick={onConfirm}
        disabled={busy}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-40"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        Confirm local command
      </button>
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
