'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMatorModels,
  fetchMatorSettings,
  type MatorModelOption,
  type MatorSettingsMasked,
  type MatorSettingsSavePatch,
  saveMatorSettings,
} from '@/modules/mator';
import type { AccountSection } from '@/modules/settings/components/account/account-format';
import { accountSection } from '@/modules/settings/components/account/account-format';
import { Notice } from '@/modules/settings/components/account/account-notice';
import { DisconnectNetworkDialog } from '@/modules/settings/components/account/dialogs/disconnect-network-dialog';
import {
  type ProfileDraft,
  ProfileEditorDialog,
} from '@/modules/settings/components/account/dialogs/profile-editor-dialog';
import { ProfilePlanDialog } from '@/modules/settings/components/account/dialogs/profile-plan-dialog';
import { RemoveAccountDialog } from '@/modules/settings/components/account/dialogs/remove-account-dialog';
import { AccountSectionNav } from '@/modules/settings/components/account/sections/account-section-nav';
import { MatorAccountSection } from '@/modules/settings/components/account/sections/mator-account-section';
import { NetworksSection } from '@/modules/settings/components/account/sections/networks-section';
import { PreferencesSection } from '@/modules/settings/components/account/sections/preferences-section';
import { ProfileSection } from '@/modules/settings/components/account/sections/profile-section';

export type SocialAccount = {
  id: string;
  platform: 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
  label: string;
  handle: string;
  profileUrl: string;
  avatarUrl?: string;
};

type Profile = ProfileDraft;
type AccountState = {
  revision: number;
  profile: Profile;
  socialAccounts: SocialAccount[];
};
type Connection = {
  id: string;
  platform?: string;
  handle?: string;
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null;
  avatarUrl?: string;
};

const endpoint = '/api/account';

export default function AccountHome({
  pathname,
  pane,
  available,
  selectedAccount,
  onNavigate,
  onConnect,
  linkedAccountId,
}: {
  pathname: string;
  pane: string;
  available: 'checking' | 'ready' | 'offline';
  selectedAccount: {
    platform: string;
    label: string;
    handle: string;
    profileUrl: string;
    status: string;
  } | null;
  onNavigate: (path: string) => void;
  onSelectAccount: (account: SocialAccount) => void;
  onConnect: () => void;
  linkedAccountId?: string | null;
}) {
  const routed = accountSection(pathname, pane);
  const [section, setSection] = useState<AccountSection>(routed);
  const [planOpen, setPlanOpen] = useState(false);
  const [data, setData] = useState<AccountState | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState<
    Partial<Record<'linkedin' | 'x', string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [hosted, setHosted] = useState(false);
  const [mator, setMator] = useState<MatorSettingsMasked | null>(null);
  const [models, setModels] = useState<MatorModelOption[]>([]);
  const [voices, setVoices] = useState<
    Array<{ id: string; label: string; language: string }>
  >([]);
  const [matorLoading, setMatorLoading] = useState(true);
  const [matorError, setMatorError] = useState('');
  const [matorBusy, setMatorBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pane === 'settings' || pathname === '/dashboard/settings') {
      setSection((current) =>
        current === 'preferences' || current === 'mator' ? current : 'mator',
      );
      return;
    }
    setSection(pathname.endsWith('/connections') ? 'connections' : 'you');
  }, [pathname, pane]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
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

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const value = (await response.json()) as AccountState & {
        error?: string;
      };
      if (!response.ok) throw Error(value.error || 'Account unavailable');
      setData(value);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account unavailable');
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const refreshConnections = useCallback(async () => {
    const response = await fetch('/api/connectors', { cache: 'no-store' });
    if (!response.ok) return;
    const rows = (await response.json()) as Connection[];
    if (Array.isArray(rows)) setConnections(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        if (alive) await refreshConnections();
      } catch {
        /* Saved accounts remain visible when live status cannot be checked. */
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refreshConnections]);

  useEffect(() => {
    const pending = (
      Object.entries(pendingSync) as Array<
        ['linkedin' | 'x', string | undefined]
      >
    ).filter((entry): entry is ['linkedin' | 'x', string] => Boolean(entry[1]));
    if (!pending.length) return;
    let alive = true;
    const timer = window.setInterval(() => {
      void (async () => {
        for (const [platform, id] of pending) {
          if (!alive) return;
          try {
            const response = await fetch(
              `/api/connectors/${encodeURIComponent(id)}/sync`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
              },
            );
            const result = (await response.json()) as { status?: string };
            if (!alive || !response.ok || result.status !== 'connected')
              continue;
            setPendingSync((current) => ({
              ...current,
              [platform]: undefined,
            }));
            await refreshConnections();
            await loadAccount();
            setNotice('Network synced.');
          } catch {
            /* Sign-in is still open in the provider window. */
          }
        }
      })();
    }, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pendingSync, refreshConnections, loadAccount]);

  function openProviderTab(platform: 'linkedin' | 'x') {
    const url =
      platform === 'linkedin'
        ? 'https://www.linkedin.com/login'
        : 'https://x.com/i/flow/login';
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      setError('Allow a new tab so you can sign in.');
      return false;
    }
    setNotice(
      'Sign in in the new tab. Phone and computer use the same page. Come back and click Sync when you are done.',
    );
    return true;
  }

  async function beginSync(platform: 'linkedin' | 'x', accountId?: string) {
    const openSignIn = connections.find(
      (item) =>
        item.platform === platform &&
        item.status === 'sign-in-open' &&
        !item.handle,
    );
    const known = accountId || pendingSync[platform] || openSignIn?.id;
    const busyKey = known || platform;
    setLinkBusy(busyKey);
    setError('');
    setNotice('');
    try {
      const live = known
        ? connections.find((item) => item.id === known)
        : undefined;
      if (!known) {
        const response = await fetch('/api/connectors/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ platform }),
        });
        const result = (await response.json()) as {
          accountId?: string;
          error?: string;
          navigationWarning?: string;
        };
        if (!response.ok || !result.accountId)
          throw Error(result.error || 'Could not start sync');
        setPendingSync((current) => ({
          ...current,
          [platform]: result.accountId,
        }));
        await refreshConnections();
        return;
      }
      // A pending sign-in has no saved account yet. Sync reads that open window.
      // Connect is only for a profile that was saved and later signed out.
      if (live?.status === 'disconnected') {
        const response = await fetch(
          `/api/connectors/${encodeURIComponent(known)}/connect`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          },
        );
        const result = (await response.json()) as {
          error?: string;
          navigationWarning?: string;
        };
        if (!response.ok) throw Error(result.error || 'Could not open sign-in');
        await refreshConnections();
        return;
      }
      const response = await fetch(
        `/api/connectors/${encodeURIComponent(known)}/sync`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      const result = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok)
        throw Error(result.error || 'Could not sync this network');
      await refreshConnections();
      await loadAccount();
      if (result.status === 'connected')
        setPendingSync((current) => ({ ...current, [platform]: undefined }));
      setNotice(
        result.status === 'connected'
          ? 'Network synced.'
          : 'Sign-in is still open. Finish it, then click Sync again.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not sync this network',
      );
    } finally {
      setLinkBusy(null);
    }
  }

  async function runLink(id: string, operation: 'sync' | 'disconnect') {
    setLinkBusy(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/connectors/${encodeURIComponent(id)}/${operation}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw Error(result.error || 'Could not update this network');
      await refreshConnections();
      setDisconnectId(null);
      setNotice(
        operation === 'sync' ? 'Network synced.' : 'Network disconnected.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update this network',
      );
    } finally {
      setLinkBusy(null);
    }
  }

  const loadMator = useCallback(async () => {
    setMatorLoading(true);
    setMatorError('');
    try {
      const [settings, catalog] = await Promise.all([
        fetchMatorSettings(),
        fetchMatorModels(),
      ]);
      setMator(settings);
      setModels(catalog.models);
      setVoices(catalog.voices);
    } catch (cause) {
      setMatorError(
        cause instanceof Error ? cause.message : 'Unable to load Mator',
      );
    } finally {
      setMatorLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMator();
  }, [loadMator]);

  async function saveAccount(
    path: string,
    method: 'PUT' | 'DELETE',
    document?: unknown,
  ) {
    if (!data) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(endpoint + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: data.revision,
          ...(document === undefined ? {} : { document }),
        }),
      });
      const result = (await response.json()) as AccountState & {
        error?: string;
      };
      if (!response.ok) throw Error(result.error || 'Could not save');
      setData(result);
      setEditingProfile(false);
      setRemoveId(null);
      setNotice(method === 'DELETE' ? 'Account removed.' : 'Details saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function patchMator(
    patch: MatorSettingsSavePatch,
    options?: { clearDraft?: boolean; saved?: string },
  ) {
    setMatorBusy(true);
    setMatorError('');
    try {
      const next = await saveMatorSettings(patch);
      setMator(next);
      if (options?.clearDraft) {
        setKeyDraft('');
        setEditingKey(false);
        setKeyVisible(false);
        setConfirmClearKey(false);
      }
      if (options?.saved) setNotice(options.saved);
    } catch (cause) {
      setMatorError(cause instanceof Error ? cause.message : 'Unable to save');
    } finally {
      setMatorBusy(false);
    }
  }

  function openSection(next: AccountSection) {
    setSection(next);
    onNavigate(
      next === 'connections'
        ? '/dashboard/profile/connections'
        : next === 'you'
          ? '/dashboard/profile'
          : '/dashboard/settings',
    );
  }

  function runAim(id: string) {
    if (id === 'profile') {
      setPlanOpen(true);
      return;
    }
    if (id === 'job') {
      onNavigate('/dashboard/resumes/profile');
      return;
    }
    window.location.assign(
      id === 'audience' ? '/dashboard/editorial' : '/dashboard/growth',
    );
  }

  const profile = data?.profile;
  const initial = (profile?.displayName || 'U').trim().charAt(0).toUpperCase();
  const linkedCount = connections.filter(
    (item) => item.status === 'connected',
  ).length;
  const removeAccount =
    data?.socialAccounts.find((row) => row.id === removeId) ?? null;
  const disconnectAccount =
    data?.socialAccounts.find((row) => row.id === disconnectId) ?? null;

  return (
    <div data-testid="owner-profile-page" className="pb-16">
      <div
        data-testid="automation-settings-page"
        className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10"
      >
        <AccountSectionNav
          section={section}
          profile={profile}
          socialAccounts={data?.socialAccounts ?? []}
          linkedCount={linkedCount}
          initial={initial}
          onOpenSection={openSection}
        />
        <div className="flex max-w-3xl min-w-0 flex-col gap-4">
          {notice ? (
            <Notice tone="ok" onDismiss={() => setNotice('')}>
              {notice}
            </Notice>
          ) : null}
          {error ? (
            <Notice tone="warn" onDismiss={() => setError('')}>
              {error}
            </Notice>
          ) : null}

          {section === 'you' ? (
            <ProfileSection
              dataLoaded={Boolean(data)}
              profile={profile}
              onEdit={() => {
                if (profile) {
                  setDraft({ ...profile });
                  setEditingProfile(true);
                }
              }}
              onRunAim={runAim}
            />
          ) : null}

          {section === 'connections' ? (
            <NetworksSection
              available={available}
              socialAccounts={data?.socialAccounts}
              connections={connections}
              linkBusy={linkBusy}
              pendingSync={pendingSync}
              linkedAccountId={linkedAccountId}
              selectedAccount={selectedAccount}
              onConnect={onConnect}
              onOpenProviderTab={openProviderTab}
              onBeginSync={beginSync}
              onRequestDisconnect={setDisconnectId}
            />
          ) : null}

          {section === 'mator' ? (
            <MatorAccountSection
              matorLoading={matorLoading}
              mator={mator}
              models={models}
              voices={voices}
              matorError={matorError}
              matorBusy={matorBusy}
              keyDraft={keyDraft}
              keyVisible={keyVisible}
              editingKey={editingKey}
              confirmClearKey={confirmClearKey}
              keyInputRef={keyInputRef}
              onDismissMatorError={() => setMatorError('')}
              onKeyDraftChange={setKeyDraft}
              onSetKeyVisible={setKeyVisible}
              onEditingKeyChange={setEditingKey}
              onConfirmClearKeyChange={setConfirmClearKey}
              onPatchMator={patchMator}
            />
          ) : null}

          {section === 'preferences' ? (
            <PreferencesSection
              mator={mator}
              matorBusy={matorBusy}
              hosted={hosted}
              onPatchMator={patchMator}
            />
          ) : null}
        </div>
      </div>

      <ProfilePlanDialog open={planOpen} onDismiss={() => setPlanOpen(false)} />

      <ProfileEditorDialog
        open={editingProfile}
        draft={draft}
        saving={saving}
        onDismiss={() => setEditingProfile(false)}
        onDraftChange={(updater) =>
          setDraft((current) => (current ? updater(current) : current))
        }
        onSubmit={() => {
          if (draft) void saveAccount('/profile', 'PUT', draft);
        }}
      />

      <RemoveAccountDialog
        account={removeAccount}
        saving={saving}
        onDismiss={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeAccount) {
            void saveAccount(`/social/${removeAccount.id}`, 'DELETE');
          }
        }}
      />

      <DisconnectNetworkDialog
        account={disconnectAccount}
        linkBusy={linkBusy}
        onDismiss={() => setDisconnectId(null)}
        onConfirm={() => {
          if (disconnectAccount) {
            void runLink(disconnectAccount.id, 'disconnect');
          }
        }}
      />
    </div>
  );
}
