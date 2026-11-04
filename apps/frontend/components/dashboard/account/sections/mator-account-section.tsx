'use client';

import {
  AudioLines,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { type RefObject, useEffect } from 'react';
import {
  choiceLabel,
  senseCopy,
} from '@/components/dashboard/account/account-format';
import { Hint } from '@/components/dashboard/account/account-hint';
import { Notice } from '@/components/dashboard/account/account-notice';
import type {
  MatorModelOption,
  MatorSettingsMasked,
  MatorSettingsSavePatch,
} from '@/components/mator/mator-api';
import StudioDialog from '@/components/ui/studio-dialog';

export function MatorAccountSection({
  matorLoading,
  mator,
  models,
  voices,
  matorError,
  matorBusy,
  keyDraft,
  keyVisible,
  editingKey,
  confirmClearKey,
  keyInputRef,
  onDismissMatorError,
  onKeyDraftChange,
  onSetKeyVisible,
  onEditingKeyChange,
  onConfirmClearKeyChange,
  onPatchMator,
}: {
  matorLoading: boolean;
  mator: MatorSettingsMasked | null;
  models: MatorModelOption[];
  voices: Array<{ id: string; label: string; language: string }>;
  matorError: string;
  matorBusy: boolean;
  keyDraft: string;
  keyVisible: boolean;
  editingKey: boolean;
  confirmClearKey: boolean;
  keyInputRef: RefObject<HTMLInputElement | null>;
  onDismissMatorError: () => void;
  onKeyDraftChange: (value: string) => void;
  onSetKeyVisible: (value: boolean) => void;
  onEditingKeyChange: (value: boolean) => void;
  onConfirmClearKeyChange: (value: boolean) => void;
  onPatchMator: (
    patch: MatorSettingsSavePatch,
    options?: { clearDraft?: boolean; saved?: string },
  ) => void;
}) {
  const keyReady = Boolean(mator?.groqKeyConfigured);
  const showKeyEditor = editingKey || !keyReady;
  const keyStatus =
    mator?.keySource === 'environment'
      ? 'Environment key'
      : keyReady
        ? 'Saved key'
        : 'Not configured';

  useEffect(() => {
    if (editingKey) keyInputRef.current?.focus();
  }, [editingKey, keyInputRef]);

  return (
    <>
      <section
        aria-labelledby="account-mator-heading"
        data-testid="mator-settings-card"
        className="flex flex-col gap-8"
      >
        <header>
          <h1
            id="account-mator-heading"
            className="font-serif text-3xl tracking-tight text-[#111a25]"
          >
            Mator
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
            Your key lets Mator write, listen, and look at pictures with you. It
            stays private after you save it.
          </p>
        </header>

        {matorLoading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-[#111a25]/10 motion-reduce:animate-none" />
        ) : (
          <div className="rounded-3xl bg-[#111a25] px-6 py-7 text-white sm:px-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-teal-200" aria-hidden="true" />
                <h2 className="text-lg font-semibold">API key</h2>
              </div>
              <Hint label="About your API key">
                After you save a key, Utomator keeps it private and will not
                show it again. Edit replaces it. Remove deletes it from this
                account.
              </Hint>
            </div>
            <p
              data-testid="mator-key-status"
              className="mt-4 inline-flex min-h-8 items-center rounded-full bg-white/10 px-3 text-xs font-semibold tracking-wide text-teal-100"
            >
              {keyStatus}
            </p>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
              {mator?.keySource === 'environment'
                ? 'This computer already has a key. Save your own if you want Mator to use a different one.'
                : keyReady
                  ? 'A key is saved. Edit it whenever you want to replace it.'
                  : 'Paste a key to turn Mator on for this account.'}
            </p>

            {showKeyEditor ? (
              <div className="mt-6">
                <label
                  htmlFor="mator-api-key"
                  className="text-sm font-semibold text-white"
                >
                  API key
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white p-1.5">
                  <input
                    id="mator-api-key"
                    ref={keyInputRef}
                    type={keyVisible ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={keyDraft}
                    disabled={matorBusy}
                    placeholder={
                      keyReady ? 'Type a new key' : 'Paste your API key'
                    }
                    onChange={(event) => onKeyDraftChange(event.target.value)}
                    className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    aria-label={keyVisible ? 'Hide API key' : 'Show API key'}
                    onClick={() => onSetKeyVisible(!keyVisible)}
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                  >
                    {keyVisible ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={matorBusy || !keyDraft.trim()}
                    onClick={() =>
                      void onPatchMator(
                        { groqApiKey: keyDraft.trim() },
                        { clearDraft: true, saved: 'API key saved.' },
                      )
                    }
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-teal-500 px-4 text-sm font-semibold text-[#111a25] transition duration-200 hover:bg-teal-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                  >
                    {matorBusy ? 'Saving…' : 'Save key'}
                  </button>
                  {keyReady ? (
                    <button
                      type="button"
                      disabled={matorBusy}
                      onClick={() => {
                        onEditingKeyChange(false);
                        onKeyDraftChange('');
                        onSetKeyVisible(false);
                      }}
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p
                  className="font-mono text-lg tracking-[0.35em] text-slate-200"
                  aria-hidden="true"
                >
                  •••• •••• ••••
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEditingKeyChange(true)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white px-4 text-sm font-semibold text-[#111a25] hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Edit key
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmClearKeyChange(true)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-rose-300/60 px-4 text-sm font-semibold text-rose-100 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Remove key
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {matorError ? (
          <Notice tone="warn" onDismiss={onDismissMatorError}>
            {matorError}
          </Notice>
        ) : null}

        {mator ? (
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="font-serif text-2xl text-[#111a25]">
                How Mator shows up
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Pick the style of help you want. You can change these any time.
              </p>
            </div>
            {(
              [
                ['chat', MessageSquareText, mator.modelId, 'modelId'],
                ['vision', ImageIcon, mator.visionModelId, 'visionModelId'],
                ['speech-to-text', AudioLines, mator.sttModelId, 'sttModelId'],
                ['text-to-speech', Sparkles, mator.ttsModelId, 'ttsModelId'],
              ] as const
            ).map(([role, Icon, value, field]) => {
              const copy = senseCopy[role];
              const options = models.filter((model) => model.role === role);
              return (
                <label
                  key={role}
                  className="block border-t border-slate-200 pt-6"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-[#111a25]">
                    <Icon className="size-4 text-teal-800" aria-hidden="true" />
                    {copy.title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">
                    {copy.hint}
                  </span>
                  <select
                    data-testid={`mator-model-${role}`}
                    value={value}
                    disabled={matorBusy || options.length === 0}
                    onChange={(event) =>
                      void onPatchMator({ [field]: event.target.value })
                    }
                    className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {options.map((model) => (
                      <option key={model.id} value={model.id}>
                        {choiceLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <label className="block border-t border-slate-200 pt-6">
              <span className="text-base font-semibold text-[#111a25]">
                Care
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                Quick is faster. Thorough takes a little longer and thinks
                further.
              </span>
              <select
                data-testid="mator-reasoning-effort"
                value={mator.reasoningEffort}
                disabled={matorBusy}
                onChange={(event) =>
                  void onPatchMator({
                    reasoningEffort: event.target
                      .value as MatorSettingsSavePatch['reasoningEffort'],
                  })
                }
                className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <option value="low">Quick</option>
                <option value="medium">Balanced</option>
                <option value="high">Thorough</option>
              </select>
            </label>
            <label className="block border-t border-slate-200 pt-6">
              <span className="text-base font-semibold text-[#111a25]">
                Speaking voice
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                The voice you hear when Mator reads a note aloud.
              </span>
              <select
                data-testid="mator-tts-voice"
                value={mator.ttsVoice}
                disabled={matorBusy}
                onChange={(event) =>
                  void onPatchMator({ ttsVoice: event.target.value })
                }
                className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {(voices.length
                  ? voices
                  : [
                      {
                        id: 'hannah',
                        label: 'Hannah',
                        language: 'English',
                      },
                      { id: 'troy', label: 'Troy', language: 'English' },
                      {
                        id: 'austin',
                        label: 'Austin',
                        language: 'English',
                      },
                    ]
                ).map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} — {voice.language}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <StudioDialog
        open={confirmClearKey}
        title="Remove API key?"
        description="Mator will not be able to reply until you save a key again."
        onDismiss={() => !matorBusy && onConfirmClearKeyChange(false)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={matorBusy}
            onClick={() => onConfirmClearKeyChange(false)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Keep key
          </button>
          <button
            type="button"
            disabled={matorBusy}
            onClick={() =>
              void onPatchMator(
                { groqApiKey: null },
                { clearDraft: true, saved: 'API key removed.' },
              )
            }
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
          >
            {matorBusy ? 'Removing…' : 'Remove key'}
          </button>
        </div>
      </StudioDialog>
    </>
  );
}
