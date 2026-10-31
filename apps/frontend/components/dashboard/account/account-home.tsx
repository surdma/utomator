'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AudioLines,
  Briefcase,
  Building2,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  KeyRound,
  LogOut,
  MessagesSquare,
  MessageSquareText,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  Waypoints,
} from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import { primaryOperation, providerMeta } from '@/components/dashboard/connections/provider-meta';
import {
  growthCapabilities,
  growthJourneys,
  profileSections,
} from '@/components/dashboard/growth/linkedin-growth-capabilities';
import {
  fetchMatorModels,
  fetchMatorSettings,
  saveMatorSettings,
  type MatorModelOption,
  type MatorSettingsMasked,
  type MatorSettingsSavePatch,
} from '@/components/dashboard/pipeline/mator-api';

export type SocialAccount = {
  id: string;
  platform: 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
  label: string;
  handle: string;
  profileUrl: string;
  avatarUrl?: string;
};

type Profile = {
  displayName: string;
  email: string;
  location: string;
  about: string;
  headline?: string;
  website?: string;
  skills?: string;
  experience?: string;
  education?: string;
  avatarUrl?: string;
};
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
type Section = 'you' | 'connections' | 'mator' | 'preferences';

const endpoint = '/api/account';
const platforms = ['linkedin', 'x', 'instagram', 'github', 'devto'] as const;

const senseCopy: Record<MatorModelOption['role'], { title: string; hint: string }> = {
  chat: {
    title: 'Writing',
    hint: 'How Mator writes when you talk with it.',
  },
  vision: {
    title: 'Pictures',
    hint: 'How Mator understands images you attach.',
  },
  'speech-to-text': {
    title: 'Listening',
    hint: 'How Mator hears you when you speak.',
  },
  'text-to-speech': {
    title: 'Speaking',
    hint: 'The voice Mator uses when it talks back.',
  },
  moderation: {
    title: 'Review',
    hint: 'How Mator checks a message before preparing a step.',
  },
};

function accountSection(pathname: string, pane: string): Section {
  if (pane === 'settings' || pathname === '/dashboard/settings') return 'mator';
  if (pathname.endsWith('/connections')) return 'connections';
  return 'you';
}

const journeyIcon = {
  profile: UserRound,
  audience: Users,
  job: Briefcase,
  company: Building2,
  relationships: MessagesSquare,
} as const;

function workFor(ids: readonly string[]) {
  return ids
    .map((id) => growthCapabilities.find((item) => item.id === id)?.title)
    .filter((title): title is string => Boolean(title));
}

function choiceLabel(model: MatorModelOption) {
  const tier = model.tier === 'free' ? 'Free' : 'Paid';
  const friendly: Record<string, string> = {
    'openai/gpt-oss-20b': 'Everyday writing',
    'openai/gpt-oss-120b': 'Deeper writing',
    'qwen/qwen3.8-27b': 'Picture understanding',
    'whisper-large-v3-turbo': 'Quick listening',
    'whisper-large-v3': 'Careful listening',
    'canopylabs/orpheus-v1-english': 'Spoken replies',
  };
  return `${friendly[model.id] ?? model.label} — ${tier}`;
}

function portraitSrc(value?: string) {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.includes('displaybackground') || lower.includes('backgroundimage')) return undefined;
  return value;
}

function statusLine(status: Connection['status'] | undefined) {
  if (status === 'connected') return 'Connected';
  if (status === 'sign-in-open') return 'Finishing sign-in';
  if (status === 'api-required') return 'Waiting on official access';
  return 'Not connected';
}

function Hint({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-current/80 transition duration-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 motion-reduce:transition-none"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <p
          id={panelId}
          role="note"
          className="absolute top-12 right-0 z-20 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-xl"
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}

function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'ok' | 'warn';
  children: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={
        'flex items-start justify-between gap-4 rounded-2xl px-5 py-4 text-sm leading-6 ' +
        (tone === 'warn'
          ? 'border border-rose-200 bg-rose-50 text-rose-900'
          : 'border border-teal-200 bg-teal-50 text-teal-950')
      }
    >
      <p>{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        Dismiss
      </button>
    </div>
  );
}

function SwitchRow({
  checked,
  disabled,
  label,
  hint,
  testId,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  testId?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-slate-200 py-6 last:border-b-0">
      <div className="min-w-0">
        <p className="text-base font-semibold text-[#111a25]">{label}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="inline-flex min-h-11 min-w-16 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={
            'inline-flex h-8 w-14 items-center rounded-full p-1 transition duration-200 motion-reduce:transition-none ' +
            (checked ? 'bg-teal-700' : 'bg-slate-300')
          }
        >
          <span
            className={
              'size-6 rounded-full bg-white shadow transition duration-200 motion-reduce:transition-none ' +
              (checked ? 'translate-x-6' : 'translate-x-0')
            }
          />
        </span>
      </button>
    </div>
  );
}

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
  const [section, setSection] = useState<Section>(routed);
  const [planOpen, setPlanOpen] = useState(false);
  const [data, setData] = useState<AccountState | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState<Partial<Record<'linkedin' | 'x', string>>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [hosted, setHosted] = useState(false);
  const [mator, setMator] = useState<MatorSettingsMasked | null>(null);
  const [models, setModels] = useState<MatorModelOption[]>([]);
  const [voices, setVoices] = useState<Array<{ id: string; label: string; language: string }>>([]);
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
      const value = (await response.json()) as AccountState & { error?: string };
      if (!response.ok) throw Error(value.error || 'Account unavailable');
      setData(value);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account unavailable');
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount, linkedAccountId]);

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
      Object.entries(pendingSync) as Array<['linkedin' | 'x', string | undefined]>
    ).filter((entry): entry is ['linkedin' | 'x', string] => Boolean(entry[1]));
    if (!pending.length) return;
    let alive = true;
    const timer = window.setInterval(() => {
      void (async () => {
        for (const [platform, id] of pending) {
          if (!alive) return;
          try {
            const response = await fetch('/api/connectors/' + encodeURIComponent(id) + '/sync', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            });
            const result = (await response.json()) as { status?: string };
            if (!alive || !response.ok || result.status !== 'connected') continue;
            setPendingSync((current) => ({ ...current, [platform]: undefined }));
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
      platform === 'linkedin' ? 'https://www.linkedin.com/login' : 'https://x.com/i/flow/login';
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      setError('Allow a new tab so you can sign in.');
      return false;
    }
    setNotice('Sign in in the new tab. Phone and computer use the same page. Come back and click Sync when you are done.');
    return true;
  }

  async function beginSync(platform: 'linkedin' | 'x', accountId?: string) {
    const openSignIn = connections.find(
      (item) => item.platform === platform && item.status === 'sign-in-open' && !item.handle,
    );
    const known = accountId || pendingSync[platform] || openSignIn?.id;
    const busyKey = known || platform;
    setLinkBusy(busyKey);
    setError('');
    setNotice('');
    try {
      const live = known ? connections.find((item) => item.id === known) : undefined;
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
        setPendingSync((current) => ({ ...current, [platform]: result.accountId }));
        await refreshConnections();
        return;
      }
      // A pending sign-in has no saved account yet. Sync reads that open window.
      // Connect is only for a profile that was saved and later signed out.
      if (live?.status === 'disconnected') {
        const response = await fetch('/api/connectors/' + encodeURIComponent(known) + '/connect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        const result = (await response.json()) as { error?: string; navigationWarning?: string };
        if (!response.ok) throw Error(result.error || 'Could not open sign-in');
        await refreshConnections();
        return;
      }
      const response = await fetch('/api/connectors/' + encodeURIComponent(known) + '/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw Error(result.error || 'Could not sync this network');
      await refreshConnections();
      await loadAccount();
            if (result.status === 'connected')
              setPendingSync((current) => ({ ...current, [platform]: undefined }));
      setNotice(result.status === 'connected' ? 'Network synced.' : 'Sign-in is still open. Finish it, then click Sync again.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sync this network');
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
        '/api/connectors/' + encodeURIComponent(id) + '/' + operation,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(result.error || 'Could not update this network');
      await refreshConnections();
      setDisconnectId(null);
      setNotice(operation === 'sync' ? 'Network synced.' : 'Network disconnected.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this network');
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
      setMatorError(cause instanceof Error ? cause.message : 'Unable to load Mator');
    } finally {
      setMatorLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMator();
  }, [loadMator]);

  useEffect(() => {
    if (editingKey) keyInputRef.current?.focus();
  }, [editingKey]);

  async function saveAccount(path: string, method: 'PUT' | 'DELETE', document?: unknown) {
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
      const result = (await response.json()) as AccountState & { error?: string };
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

  function openSection(next: Section) {
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
    window.location.assign(id === 'audience' ? '/dashboard/editorial' : '/dashboard/growth');
  }

  const profile = data?.profile;
  const initial = (profile?.displayName || 'U').trim().charAt(0).toUpperCase();
  const linkedCount = connections.filter((item) => item.status === 'connected').length;
  const menu = [
    { id: 'you' as const, label: 'Profile', icon: UserRound },
    { id: 'connections' as const, label: 'Networks', icon: Waypoints },
    { id: 'mator' as const, label: 'Mator', icon: Sparkles },
    { id: 'preferences' as const, label: 'Preferences', icon: SlidersHorizontal },
  ];
  const keyReady = Boolean(mator?.groqKeyConfigured);
  const showKeyEditor = editingKey || !keyReady;
  const keyStatus =
    mator?.keySource === 'environment'
      ? 'Environment key'
      : keyReady
        ? 'Saved key'
        : 'Not configured';
  const removeAccount = data?.socialAccounts.find((row) => row.id === removeId) ?? null;
  const disconnectAccount = data?.socialAccounts.find((row) => row.id === disconnectId) ?? null;

  return (
    <div data-testid="owner-profile-page" className="pb-16">
      <div data-testid="automation-settings-page" className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <aside className="rounded-3xl bg-white p-4 shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)] lg:sticky lg:top-0">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-[#111a25] font-serif text-xl text-white">
              {portraitSrc(profile?.avatarUrl) ||
              portraitSrc(data?.socialAccounts.find((row) => portraitSrc(row.avatarUrl))?.avatarUrl) ? (
                <img
                  src={
                    portraitSrc(profile?.avatarUrl) ||
                    portraitSrc(data?.socialAccounts.find((row) => portraitSrc(row.avatarUrl))?.avatarUrl)
                  }
                  alt=""
                  className="size-12 object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#111a25]">
                {profile?.displayName || 'Account'}
              </p>
              <p className="text-xs text-slate-500">{linkedCount} linked</p>
            </div>
          </div>
          <nav aria-label="Account" className="mt-3 grid grid-cols-2 gap-1 lg:grid-cols-1">
            {menu.map((item) => {
              const active = section === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => openSection(item.id)}
                  className={
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none ' +
                    (active ? 'bg-[#111a25] text-white' : 'text-slate-700 hover:bg-slate-50')
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 max-w-3xl flex-col gap-4">
          {notice ? <Notice tone="ok" onDismiss={() => setNotice('')}>{notice}</Notice> : null}
          {error ? <Notice tone="warn" onDismiss={() => setError('')}>{error}</Notice> : null}

          {section === 'you' && (
            <section aria-labelledby="account-you-heading" className="flex flex-col gap-4">
              <h1 id="account-you-heading" className="font-serif text-3xl tracking-tight text-[#111a25]">
                Profile
              </h1>
              <div className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  {!data || !profile ? (
                    <div className="h-10 flex-1 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[#111a25]">
                          {profile.displayName || 'Name not added'}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-slate-500">
                          {[profile.headline, profile.email, profile.location].filter(Boolean).join(' · ') ||
                            'Add email and location'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({ ...profile });
                          setEditingProfile(true);
                        }}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit
                      </button>
                    </>
                  )}
                </div>
                {profile &&
                [profile.about, profile.website, profile.skills, profile.experience, profile.education].some(Boolean) ? (
                  <dl className="grid gap-4 border-b border-slate-100 px-5 py-4 sm:grid-cols-2">
                    {(
                      [
                        ['About', profile.about],
                        ['Website', profile.website],
                        ['Skills', profile.skills],
                        ['Experience', profile.experience],
                        ['Education', profile.education],
                      ] as const
                    )
                      .filter(([, value]) => Boolean(value))
                      .map(([label, value]) => (
                        <div key={label} className={label === 'About' || label === 'Experience' ? 'sm:col-span-2' : ''}>
                          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
                          <dd className="mt-1 line-clamp-4 text-sm leading-6 text-[#111a25]">{value}</dd>
                        </div>
                      ))}
                  </dl>
                ) : null}
                <ul>
                  {growthJourneys.map((journey) => {
                    const Icon = journeyIcon[journey.id];
                    const action =
                      journey.id === 'profile' ? 'Review' : journey.id === 'job' ? 'Open career' : 'Open';
                    return (
                      <li key={journey.id} className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#111a25]">{journey.title}</p>
                          <p className="truncate text-sm text-slate-500">{journey.outcome}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => runAim(journey.id)}
                          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-xl px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                        >
                          {action}
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          )}

          {section === 'connections' && (
            <section aria-labelledby="account-networks-heading" className="flex flex-col gap-4">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="account-networks-heading" className="font-serif text-3xl tracking-tight text-[#111a25]">
                  Networks
                </h1>
                <button
                  type="button"
                  onClick={onConnect}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition duration-200 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none"
                >
                  Manage connections
                </button>
              </header>
              {available === 'offline' ? (
                <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
                  Utomator is not running on this computer, so live connection status may be out of date. Saved accounts are still listed.
                </p>
              ) : null}
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)]">
                {platforms.map((platformKey) => {
                  const meta = providerMeta[platformKey];
                  const Icon = meta.icon;
                  const rows = data?.socialAccounts.filter((row) => row.platform === platformKey) ?? [];
                  return (
                    <li key={platformKey} className="px-5 py-4">
                      {rows.length === 0 ? (
                        <div className="flex items-center gap-4">
                          <span className={'flex size-11 shrink-0 items-center justify-center rounded-xl ' + meta.tile}>
                            <Icon className="size-5!" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h2 className="text-base font-semibold text-[#111a25]">{meta.name}</h2>
                            <p className="text-sm text-slate-500">No verified account linked.</p>
                          </div>
                          {platformKey === 'linkedin' || platformKey === 'x' ? (
                            <button
                              type="button"
                              disabled={linkBusy === platformKey || linkBusy === pendingSync[platformKey]}
                              onClick={() => {
                                openProviderTab(platformKey);
                                void beginSync(platformKey);
                              }}
                              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl bg-[#111a25] px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {linkBusy === platformKey || linkBusy === pendingSync[platformKey] ? 'Working…' : 'Sync'}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {rows.map((row) => {
                            const live = connections.find((item) => item.id === row.id);
                            const inUse =
                              linkedAccountId === row.id ||
                              (selectedAccount?.platform === row.platform &&
                                selectedAccount.handle === row.handle);
                            const disconnecting =
                              primaryOperation(live?.status ?? 'disconnected', live?.verifiedAt ?? null) ===
                              'disconnect';
                            const portrait = portraitSrc(row.avatarUrl);
                            return (
                              <div key={row.id} className="flex items-center gap-4">
                                <span className={'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full ' + (portrait ? '' : meta.tile)}>
                                  {portrait ? (
                                    <img src={portrait} alt="" className="size-11 object-cover" />
                                  ) : (
                                    <Icon className="size-5!" />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <h2 className="truncate text-base font-semibold text-[#111a25]">{meta.name}</h2>
                                    <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-900">
                                      {statusLine(live?.status)}
                                    </span>
                                  </div>
                                  <p className="truncate text-sm text-slate-500">
                                    @{row.handle}
                                    {inUse ? ' · In use' : ''}
                                  </p>
                                </div>
                                {row.platform === 'linkedin' || row.platform === 'x' ? (
                                  disconnecting ? (
                                    <button
                                      type="button"
                                      disabled={linkBusy === row.id}
                                      onClick={() => setDisconnectId(row.id)}
                                      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {linkBusy === row.id ? 'Working…' : 'Disconnect'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={linkBusy === row.id}
                                      onClick={() => {
                                        openProviderTab(row.platform as 'linkedin' | 'x');
                                        void beginSync(row.platform as 'linkedin' | 'x', row.id);
                                      }}
                                      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl bg-[#111a25] px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {linkBusy === row.id ? 'Working…' : 'Sync'}
                                    </button>
                                  )
                                ) : null}
                              </div>
                            );
                          })}
                          {rows.length > 1 ? (
                            <p role="alert" className="text-sm leading-6 text-amber-900">
                              More than one account is saved here. Remove the extra one before connecting another.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {section === 'mator' && (
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
                  Your key lets Mator write, listen, and look at pictures with you. It stays private after you save it.
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
                      After you save a key, Utomator keeps it private and will not show it again. Edit replaces it. Remove deletes it from this account.
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
                      <label htmlFor="mator-api-key" className="text-sm font-semibold text-white">
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
                          placeholder={keyReady ? 'Type a new key' : 'Paste your API key'}
                          onChange={(event) => setKeyDraft(event.target.value)}
                          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          aria-label={keyVisible ? 'Hide API key' : 'Show API key'}
                          onClick={() => setKeyVisible((value) => !value)}
                          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                        >
                          {keyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={matorBusy || !keyDraft.trim()}
                          onClick={() =>
                            void patchMator(
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
                              setEditingKey(false);
                              setKeyDraft('');
                              setKeyVisible(false);
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
                      <p className="font-mono text-lg tracking-[0.35em] text-slate-200" aria-hidden="true">
                        •••• •••• ••••
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingKey(true)}
                          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-white px-4 text-sm font-semibold text-[#111a25] hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                          Edit key
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearKey(true)}
                          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-rose-300/60 px-4 text-sm font-semibold text-rose-100 hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                          Remove key
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {matorError ? <Notice tone="warn" onDismiss={() => setMatorError('')}>{matorError}</Notice> : null}

              {mator ? (
                <div className="flex flex-col gap-8">
                  <div>
                    <h2 className="font-serif text-2xl text-[#111a25]">How Mator shows up</h2>
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
                      <label key={role} className="block border-t border-slate-200 pt-6">
                        <span className="flex items-center gap-2 text-base font-semibold text-[#111a25]">
                          <Icon className="size-4 text-teal-800" aria-hidden="true" />
                          {copy.title}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-slate-600">{copy.hint}</span>
                        <select
                          data-testid={`mator-model-${role}`}
                          value={value}
                          disabled={matorBusy || options.length === 0}
                          onChange={(event) => void patchMator({ [field]: event.target.value })}
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
                    <span className="text-base font-semibold text-[#111a25]">Care</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      Quick is faster. Thorough takes a little longer and thinks further.
                    </span>
                    <select
                      data-testid="mator-reasoning-effort"
                      value={mator.reasoningEffort}
                      disabled={matorBusy}
                      onChange={(event) =>
                        void patchMator({
                          reasoningEffort: event.target.value as MatorSettingsSavePatch['reasoningEffort'],
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
                    <span className="text-base font-semibold text-[#111a25]">Speaking voice</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      The voice you hear when Mator reads a note aloud.
                    </span>
                    <select
                      data-testid="mator-tts-voice"
                      value={mator.ttsVoice}
                      disabled={matorBusy}
                      onChange={(event) => void patchMator({ ttsVoice: event.target.value })}
                      className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                      {(voices.length
                        ? voices
                        : [
                            { id: 'hannah', label: 'Hannah', language: 'English' },
                            { id: 'troy', label: 'Troy', language: 'English' },
                            { id: 'austin', label: 'Austin', language: 'English' },
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
          )}

          {section === 'preferences' && (
            <section aria-labelledby="account-preferences-heading" className="flex flex-col gap-4">
              <header>
                <h1
                  id="account-preferences-heading"
                  className="font-serif text-3xl tracking-tight text-[#111a25]"
                >
                  Preferences
                </h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                  Choose how much Mator does on its own, and how it talks with you.
                </p>
              </header>
              <div className="rounded-3xl bg-white px-6 shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)] sm:px-8">
                <SwitchRow
                  label="Ask before changes"
                  hint="Mator shows a change and waits. Turn this off to let those changes apply right away."
                  checked={!(mator?.autoApprove ?? false)}
                  disabled={matorBusy || !mator}
                  onChange={(ask) => void patchMator({ autoApprove: !ask })}
                />
                <SwitchRow
                  label="Keep older chats short"
                  hint="Mator sets aside earlier messages so a long conversation stays easy to follow."
                  checked={mator?.squashPipelineHistory ?? false}
                  disabled={matorBusy || !mator}
                  onChange={(value) => void patchMator({ squashPipelineHistory: value })}
                />
                <SwitchRow
                  label="Read notes aloud"
                  hint="Mator speaks short explanations while you work together."
                  checked={mator?.howTtsEnabled ?? true}
                  disabled={matorBusy || !mator}
                  onChange={(value) => void patchMator({ howTtsEnabled: value })}
                />
                <SwitchRow
                  label="Check messages first"
                  hint="Mator reviews what you send before it prepares the next step."
                  testId="mator-moderation-toggle"
                  checked={mator?.moderationEnabled ?? false}
                  disabled={matorBusy || !mator}
                  onChange={(value) => void patchMator({ moderationEnabled: value })}
                />
              </div>
              {hosted ? (
                <form method="post" action="/auth/logout" className="border-t border-slate-200 pt-8">
                  <h2 className="text-base font-semibold text-[#111a25]">Sign out</h2>
                  <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">
                    This signs you out of Utomator. Your linked networks stay as they are.
                  </p>
                  <button
                    type="submit"
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </form>
              ) : null}
            </section>
          )}
        </div>
      </div>

      <StudioDialog
        open={planOpen}
        title="Improve my profile"
        description="A prioritized, evidence-backed section revision plan and a measured follow-up."
        onDismiss={() => setPlanOpen(false)}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {workFor(growthJourneys[0].sequence).map((step) => (
            <li key={step} className="text-sm font-medium text-[#111a25]">{step}</li>
          ))}
        </ul>
        <ul className="mt-4 grid gap-x-6 gap-y-1 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {profileSections.map((section) => (
            <li key={section} className="text-sm leading-7 text-slate-600">{section}</li>
          ))}
        </ul>
      </StudioDialog>

      <StudioDialog
        open={editingProfile}
        title="Edit personal details"
        description="This is how you appear inside Utomator."
        onDismiss={() => !saving && setEditingProfile(false)}
        testId="account-profile-dialog"
      >
        {draft ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAccount('/profile', 'PUT', draft);
            }}
          >
            {(
              [
                ['displayName', 'Display name', 'text', 150],
                ['email', 'Email', 'email', 180],
                ['location', 'Location', 'text', 180],
              ] as const
            ).map(([key, label, type, max]) => (
              <label key={key} className="block text-sm font-semibold text-slate-800">
                {label}
                <input
                  required={key === 'displayName'}
                  type={type}
                  autoComplete={key === 'email' ? 'email' : 'off'}
                  maxLength={max}
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((current) => current && { ...current, [key]: event.target.value })
                  }
                  className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                />
              </label>
            ))}
            <label className="block text-sm font-semibold text-slate-800">
              About
              <textarea
                rows={4}
                maxLength={1200}
                value={draft.about}
                onChange={(event) =>
                  setDraft((current) => current && { ...current, about: event.target.value })
                }
                className="mt-2 block w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base leading-7 font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingProfile(false)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        ) : null}
      </StudioDialog>

      <StudioDialog
        open={Boolean(removeAccount)}
        title="Remove this account?"
        description={
          removeAccount
            ? `${removeAccount.label} will be forgotten here. You can connect it again later.`
            : undefined
        }
        onDismiss={() => !saving && setRemoveId(null)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setRemoveId(null)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Keep account
          </button>
          <button
            type="button"
            disabled={saving || !removeAccount}
            onClick={() => removeAccount && void saveAccount('/social/' + removeAccount.id, 'DELETE')}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
          >
            {saving ? 'Removing…' : 'Remove account'}
          </button>
        </div>
      </StudioDialog>

      <StudioDialog
        open={Boolean(disconnectAccount)}
        title="Disconnect this network?"
        description={
          disconnectAccount
            ? `${disconnectAccount.label} will be signed out here. You can connect it again later.`
            : undefined
        }
        onDismiss={() => !linkBusy && setDisconnectId(null)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={Boolean(linkBusy)}
            onClick={() => setDisconnectId(null)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Stay connected
          </button>
          <button
            type="button"
            disabled={Boolean(linkBusy) || !disconnectAccount}
            onClick={() => disconnectAccount && void runLink(disconnectAccount.id, 'disconnect')}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
          >
            {linkBusy ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </StudioDialog>

      <StudioDialog
        open={confirmClearKey}
        title="Remove API key?"
        description="Mator will not be able to reply until you save a key again."
        onDismiss={() => !matorBusy && setConfirmClearKey(false)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={matorBusy}
            onClick={() => setConfirmClearKey(false)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Keep key
          </button>
          <button
            type="button"
            disabled={matorBusy}
            onClick={() =>
              void patchMator({ groqApiKey: null }, { clearDraft: true, saved: 'API key removed.' })
            }
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
          >
            {matorBusy ? 'Removing…' : 'Remove key'}
          </button>
        </div>
      </StudioDialog>
    </div>
  );
}
