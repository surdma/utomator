'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Settings2, ShieldCheck, LogOut, Bot } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from '@/components/ui/automate-card';
import {
  fetchMatorSettings,
  saveMatorSettings,
  type MatorSettingsMasked,
} from '@/components/dashboard/pipeline/mator-api';

export function AutomationSettingsPage({
  available,
  platform,
  selectedAccount,
}: {
  available: 'checking' | 'ready' | 'offline';
  platform: 'linkedin' | 'x';
  selectedAccount: {
    platform: string;
    label: string;
    handle: string;
    profileUrl: string;
    status: string;
    verifiedAt: string | null;
  } | null;
}) {
  const selected =
    selectedAccount?.platform === platform ? selectedAccount : null;
  const [hosted, setHosted] = useState(false);
  const [mator, setMator] = useState<MatorSettingsMasked | null>(null);
  const [matorLoading, setMatorLoading] = useState(true);
  const [matorError, setMatorError] = useState<string | null>(null);
  const [matorBusy, setMatorBusy] = useState(false);
  const [groqKeyDraft, setGroqKeyDraft] = useState('');

  const loadMatorSettings = useCallback(async () => {
    setMatorLoading(true);
    setMatorError(null);
    try {
      setMator(await fetchMatorSettings());
    } catch (error) {
      setMatorError(
        error instanceof Error ? error.message : 'Unable to load Mator settings',
      );
    } finally {
      setMatorLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatorSettings();
  }, [loadMatorSettings]);

  const patchMator = async (
    patch: Parameters<typeof saveMatorSettings>[0],
    options?: { clearGroqDraft?: boolean },
  ) => {
    setMatorBusy(true);
    setMatorError(null);
    try {
      const next = await saveMatorSettings(patch);
      setMator(next);
      if (options?.clearGroqDraft) setGroqKeyDraft('');
    } catch (error) {
      setMatorError(
        error instanceof Error ? error.message : 'Unable to save Mator settings',
      );
    } finally {
      setMatorBusy(false);
    }
  };

  useEffect(() => {
    // The original local-only Next app has no application-auth endpoint.
    if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
    let current = true;
    fetch('/auth/me', { cache: 'no-store' })
      .then((response) => {
        if (current && response.ok) setHosted(true);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return (
    <div data-testid="automation-settings-page" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Settings2 className="size-4" />
              {hosted ? 'Hosted account settings' : 'Local automation settings'}
            </span>
          </CardTitle>
          <CardDescription>
            Each run uses the currently selected social account rather than the
            portfolio owner&apos;s handle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-3 border-b border-slate-100 pb-3">
            <span>Engine</span>
            <strong className="capitalize">{available}</strong>
          </div>
          <div className="flex justify-between gap-3 border-b border-slate-100 pb-3">
            <span>Selected platform</span>
            <strong className="capitalize">{platform}</strong>
          </div>
          <div className="flex justify-between gap-3 border-b border-slate-100 pb-3">
            <span>Social account</span>
            <strong>{selected ? selected.label : 'Not selected'}</strong>
          </div>
          <div className="flex justify-between gap-3 border-b border-slate-100 pb-3">
            <span>Session</span>
            <strong className="capitalize">
              {selected?.status.replaceAll('-', ' ') || 'Not connected'}
            </strong>
          </div>
          <div className="flex justify-between gap-3">
            <span>Mutation policy</span>
            <strong className="flex items-center gap-1 text-teal-800">
              <ShieldCheck className="size-4" />
              {mator?.autoApprove ? 'Auto-approve' : 'Human approval'}
            </strong>
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            Browser credentials and session cookies stay outside the account
            database. A saved URL alone does not authorize a workflow.
          </p>
        </CardContent>
      </Card>
      <Card data-testid="mator-settings-card">
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Bot className="size-4" />
              Mator assistant
            </span>
          </CardTitle>
          <CardDescription>
            Groq credentials and chat behavior for pipeline planning. Keys are
            encrypted at rest and never shown again after save.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {matorLoading ? (
            <p className="text-slate-500">Loading Mator settings…</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">Groq API key</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-xs font-semibold ' +
                      (mator?.groqKeyConfigured
                        ? 'bg-teal-50 text-teal-800'
                        : 'bg-slate-100 text-slate-600')
                    }
                  >
                    {mator?.groqKeyConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  <span>New or replacement key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={groqKeyDraft}
                    disabled={matorBusy}
                    onChange={(e) => setGroqKeyDraft(e.target.value)}
                    placeholder={
                      mator?.groqKeyConfigured
                        ? 'Enter a new key to replace the stored one'
                        : 'Paste your Groq API key'
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={matorBusy || !groqKeyDraft.trim()}
                    onClick={() =>
                      void patchMator(
                        { groqApiKey: groqKeyDraft.trim() },
                        { clearGroqDraft: true },
                      )
                    }
                    className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50"
                  >
                    Save key
                  </button>
                  {mator?.groqKeyConfigured ? (
                    <button
                      type="button"
                      disabled={matorBusy}
                      onClick={() =>
                        void patchMator(
                          { groqApiKey: null },
                          { clearGroqDraft: true },
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      Clear stored key
                    </button>
                  ) : null}
                </div>
              </div>
              <label className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-slate-700">Auto-approve</span>
                  <span className="text-xs text-slate-500">
                    Apply Mator plan edits without a manual confirm step.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={mator?.autoApprove ?? false}
                  disabled={matorBusy || !mator}
                  onChange={(e) =>
                    void patchMator({ autoApprove: e.target.checked })
                  }
                  className="mt-1 size-4 accent-teal-700"
                />
              </label>
              <label className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-slate-700">
                    Squash pipeline history
                  </span>
                  <span className="text-xs text-slate-500">
                    Collapse older pipeline context before each Mator turn.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={mator?.squashPipelineHistory ?? false}
                  disabled={matorBusy || !mator}
                  onChange={(e) =>
                    void patchMator({
                      squashPipelineHistory: e.target.checked,
                    })
                  }
                  className="mt-1 size-4 accent-teal-700"
                />
              </label>
              <label className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-slate-700">
                    How-it-works voice
                  </span>
                  <span className="text-xs text-slate-500">
                    Read short explanations aloud during operator chat.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={mator?.howTtsEnabled ?? true}
                  disabled={matorBusy || !mator}
                  onChange={(e) =>
                    void patchMator({ howTtsEnabled: e.target.checked })
                  }
                  className="mt-1 size-4 accent-teal-700"
                />
              </label>
              {mator ? (
                <p className="text-xs text-slate-500">
                  Model:{' '}
                  <span className="font-mono text-slate-700">{mator.modelId}</span>
                </p>
              ) : null}
            </>
          )}
          {matorError ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {matorError}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {hosted && (
        <Card>
          <CardHeader>
            <CardTitle>Application session</CardTitle>
            <CardDescription>
              Sign out from Utomator without confusing social-account sessions
              with application identity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-100"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Selected social identity</CardTitle>
          <CardDescription>
            Only account details explicitly saved in your social profile
            directory are shown here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected ? (
            <>
              <p className="text-sm font-semibold">@{selected.handle}</p>
              <p className="text-xs break-all text-slate-600">
                {selected.profileUrl}
              </p>
              <p className="text-xs text-slate-500">
                {selected.verifiedAt
                  ? 'Last verified: ' +
                    new Date(selected.verifiedAt).toLocaleString()
                  : 'Not verified yet'}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No account selected. Use the connector to sign in and verify a
              supported social account before running workflows.
            </p>
          )}
          <a
            href="/dashboard/profile/connections"
            className="inline-flex items-center gap-2 text-xs font-bold text-teal-700 hover:underline"
          >
            Manage social accounts <ArrowRight className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
