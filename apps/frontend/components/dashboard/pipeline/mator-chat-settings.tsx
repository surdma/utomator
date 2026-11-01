'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Settings } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ModelSelector } from '@/components/ai-elements/model-selector';
import {
  fetchMatorModels,
  fetchMatorSettings,
  saveMatorSettings,
  type MatorModelOption,
  type MatorSettingsMasked,
} from './mator-api';

const EFFORT_STOPS = ['low', 'medium', 'high'] as const;
const EFFORT_LABELS = ['Low', 'Medium', 'High'] as const;

type Props = { disabled?: boolean };

/**
 * Chat-thread settings popover. Exposes only settings the backend
 * actually persists in `MatorSettingsMasked`; the default save flow is
 * unchanged (same patch keys as the settings page).
 */
export default function MatorChatSettings({ disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MatorSettingsMasked | null>(null);
  const [models, setModels] = useState<MatorModelOption[]>([]);
  const [error, setError] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedSettings, loadedModels] = await Promise.all([
        fetchMatorSettings(),
        fetchMatorModels(),
      ]);
      setSettings(loadedSettings);
      setModels(loadedModels.models.filter((model) => model.role === 'chat'));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load chat settings'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const patch = useCallback(
    async (change: Partial<MatorSettingsMasked> & Record<string, unknown>) => {
      setSaving(true);
      try {
        const saved = await saveMatorSettings(change);
        setSettings(saved);
        toast('Chat settings saved', 'success');
      } catch (cause) {
        toast(
          cause instanceof Error
            ? cause.message
            : 'Unable to save chat settings',
          'error'
        );
      } finally {
        setSaving(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      aria-label="Chat settings"
      contentClassName="w-[min(19rem,calc(100vw-2rem))]"
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Chat settings"
          data-testid="mator-settings-trigger"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="block cursor-pointer rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="inline-flex size-11 items-center justify-center">
            <Settings className="size-4" aria-hidden="true" />
          </span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 px-1.5 py-1">
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : error ? (
          <div className="space-y-2" role="alert">
            <p className="text-xs text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Retry loading settings
            </button>
          </div>
        ) : settings ? (
          <>
            <div>
              <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Chat model
              </p>
              <div className="mt-1.5">
                <ModelSelector
                  models={models}
                  currentId={settings.modelId}
                  onSelect={(modelId) => void patch({ modelId })}
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Reasoning effort
                </p>
                <Badge tone="outline" size="xs">
                  {settings.reasoningEffort}
                </Badge>
              </div>
              <div className="mt-2">
                <Slider
                  value={EFFORT_STOPS.indexOf(settings.reasoningEffort)}
                  min={0}
                  max={2}
                  step={1}
                  stops={EFFORT_LABELS}
                  disabled={saving}
                  aria-label="Reasoning effort"
                  aria-valuetext={settings.reasoningEffort}
                  onValueChange={(value) =>
                    void patch({
                      reasoningEffort: EFFORT_STOPS[value] ?? 'medium',
                    })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              <SettingsRow
                label="Auto-approve staged changes"
                hint="Skips the confirmation step when the backend allows it."
                checked={settings.autoApprove}
                saving={saving}
                onToggle={(autoApprove) => void patch({ autoApprove })}
              />
              <SettingsRow
                label="Speak replies"
                hint="Reads Mator's guided replies aloud."
                checked={settings.howTtsEnabled}
                saving={saving}
                onToggle={(howTtsEnabled) => void patch({ howTtsEnabled })}
              />
              <SettingsRow
                label="Moderation check"
                hint="Mator re-checks a step before it can be staged."
                checked={settings.moderationEnabled}
                saving={saving}
                onToggle={(moderationEnabled) =>
                  void patch({ moderationEnabled })
                }
              />
            </div>
          </>
        ) : null}
        {saving && (
          <LoaderCircle
            className="size-3 animate-spin self-end text-teal-700"
            aria-hidden="true"
          />
        )}
      </div>
    </Popover>
  );
}

function SettingsRow({
  label,
  hint,
  checked,
  saving,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  saving: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-700">
          {label}
        </span>
        <span className="block text-[10px] leading-4 text-slate-400">
          {hint}
        </span>
      </span>
      <Switch
        checked={checked}
        disabled={saving}
        onCheckedChange={onToggle}
        aria-label={label}
      />
    </label>
  );
}
