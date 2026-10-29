'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
export type SocialAccount = {
  id: string;
  platform: 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
  label: string;
  handle: string;
  profileUrl: string;
};
type Profile = {
  displayName: string;
  email: string;
  location: string;
  about: string;
};
type State = {
  revision: number;
  profile: Profile;
  socialAccounts: SocialAccount[];
};
type View = 'overview' | 'details' | 'connections';
const endpoint = '/api/account';
const btn =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50';
const input =
  'mt-2 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';
type Connection = {
  id: string;
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null;
};
function Field({
  label,
  value,
  change,
  max = 240,
  lines = 0,
}: {
  label: string;
  value: string;
  change: (s: string) => void;
  max?: number;
  lines?: number;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {lines ? (
        <textarea
          rows={lines}
          maxLength={max}
          value={value}
          onChange={(e) => change(e.target.value)}
          className={input + ' resize-y'}
        />
      ) : (
        <input
          maxLength={max}
          value={value}
          onChange={(e) => change(e.target.value)}
          className={input}
        />
      )}
    </label>
  );
}
export default function AccountStudio({
  view,
  onNavigate,
  onSelectAccount,
  onConnect,
  linkedAccountId,
}: {
  view: View;
  onNavigate: (path: string) => void;
  onSelectAccount: (account: SocialAccount) => void;
  onConnect: () => void;
  linkedAccountId?: string | null;
}) {
  const [data, setData] = useState<State | null>(null),
    [profile, setProfile] = useState<Profile | null>(null);
  const [modal, setModal] = useState<'profile' | null>(null);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/connectors', { cache: 'no-store' });
        if (!res.ok) return;
        const rows = (await res.json()) as Connection[];
        if (alive && Array.isArray(rows)) setConnections(rows);
      } catch {
        /* A disconnected engine does not erase the saved account directory. */
      }
    };
    void check();
    const timer = setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void fetch(endpoint, { cache: 'no-store' })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw Error(value.error || 'Account unavailable');
        if (active) setData(value as State);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [linkedAccountId]);
  async function save(
    path: string,
    method: 'PUT' | 'POST' | 'DELETE',
    document?: unknown
  ) {
    if (!data) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(endpoint + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: data.revision,
          ...(document === undefined ? {} : { document }),
        }),
      });
      const result = (await r.json()) as State & { error?: string };
      if (!r.ok) throw Error(result.error || 'Could not save');
      setData(result);
      setModal(null);
      setNotice('Saved locally.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save account');
    } finally {
      setSaving(false);
    }
  }
  const pages = [
    ['overview', 'Overview', '/dashboard/profile'],
    ['details', 'Personal details', '/dashboard/profile/details'],
    ['connections', 'Social accounts', '/dashboard/profile/connections'],
  ] as const;
  return (
    <div
      data-testid="owner-profile-page"
      className="mx-auto flex max-w-5xl flex-col gap-8 pb-12"
    >
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-widest text-teal-700 uppercase">
          Utomator account
        </p>
        <h1 className="font-serif text-3xl tracking-tight text-slate-900">
          Your account.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Private workspace identity and social profiles, separate from career
          documents.
        </p>
      </header>
      <nav
        aria-label="Profile sections"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-4"
      >
        {pages.map(([id, name, path]) => (
          <button
            key={id}
            type="button"
            aria-current={id === view ? 'page' : undefined}
            className={
              'rounded-xl px-4 py-3 text-sm font-semibold ' +
              (id === view
                ? 'bg-teal-700 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100')
            }
            onClick={() => onNavigate(path)}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800"
        >
          {notice}
        </p>
      )}
      {!data ? (
        <p className="rounded-2xl bg-white p-8 text-sm">
          {error
            ? 'Start the local Utomator engine to load account details.'
            : 'Loading account…'}
        </p>
      ) : (
        <>
          {view === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-slate-200 bg-white p-8">
                <div className="flex items-center gap-4">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-800">
                    <UserRound className="size-8" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      Workspace owner
                    </p>
                    <h2 className="mt-2 font-serif text-2xl">
                      {data.profile.displayName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {data.profile.email}
                    </p>
                  </div>
                </div>
                <p className="mt-7 text-sm leading-7 text-slate-600">
                  {data.profile.about ||
                    'Add a short description in Personal details.'}
                </p>
                <button
                  className={btn + ' mt-7'}
                  onClick={() => onNavigate('/dashboard/profile/details')}
                >
                  Personal details
                  <ArrowRight className="size-4" />
                </button>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-white p-8">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Verified social connections
                </p>
                <strong className="mt-4 block font-serif text-5xl text-slate-900">
                  {connections.filter((s) => s.status === 'connected').length}
                </strong>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Connect your accounts securely. Each platform supports a
                  single linked identity.
                </p>
                <button
                  className={btn + ' mt-7'}
                  onClick={() => onNavigate('/dashboard/profile/connections')}
                >
                  Manage accounts
                  <ArrowRight className="size-4" />
                </button>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-white p-8 lg:col-span-2">
                <h2 className="font-serif text-2xl">
                  Career information lives in Résumés
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  Work history, education, skills and tailored job applications
                  are not account settings.
                </p>
                <button
                  className={btn + ' mt-5'}
                  onClick={() => onNavigate('/dashboard/resumes/profile')}
                >
                  Open career source
                  <ArrowRight className="size-4" />
                </button>
              </article>
            </div>
          )}
          {view === 'details' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl">Personal details</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Private display information, not authentication settings.
                  </p>
                </div>
                <button
                  className={btn}
                  onClick={() => {
                    setProfile({ ...data.profile });
                    setError('');
                    setModal('profile');
                  }}
                >
                  <Pencil className="size-4" />
                  Edit details
                </button>
              </div>
              <dl className="mt-8 grid gap-7 border-t border-slate-100 pt-8 sm:grid-cols-2">
                {Object.entries({
                  Name: data.profile.displayName,
                  Email: data.profile.email,
                  Location: data.profile.location,
                  About: data.profile.about,
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      {k}
                    </dt>
                    <dd className="mt-2 text-base leading-7 break-words">
                      {v || 'Not provided'}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {view === 'connections' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl">
                    Linked social accounts
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">
                    Account identities are discovered after you sign in with the
                    provider. You cannot create a social connection by typing a
                    username.
                  </p>
                </div>
                <button
                  type="button"
                  className={
                    btn +
                    ' border-teal-700 bg-teal-700 text-white hover:bg-teal-800'
                  }
                  onClick={onConnect}
                >
                  Manage connections
                  <ArrowRight className="size-4" />
                </button>
              </div>
              <div className="mt-8 grid gap-4 xl:grid-cols-2">
                {(
                  ['linkedin', 'x', 'instagram', 'github', 'devto'] as const
                ).map((platform) => {
                  const rows = data.socialAccounts.filter(
                    (row) => row.platform === platform
                  );
                  const title = {
                    linkedin: 'LinkedIn',
                    x: 'X',
                    instagram: 'Instagram',
                    github: 'GitHub',
                    devto: 'Dev.to',
                  }[platform];
                  return (
                    <article
                      key={platform}
                      className="min-w-0 rounded-2xl border border-slate-200 p-5"
                    >
                      <p className="text-xs font-bold tracking-widest text-teal-700 uppercase">
                        {title}
                      </p>
                      {rows.length === 0 ? (
                        <>
                          <p className="mt-3 text-sm text-slate-600">
                            No verified account linked.
                          </p>
                          <button
                            type="button"
                            className={btn + ' mt-5'}
                            onClick={onConnect}
                          >
                            View connector
                            <ArrowRight className="size-4" />
                          </button>
                        </>
                      ) : (
                        rows.map((row) => {
                          const status = connections.find(
                            (connection) => connection.id === row.id
                          )?.status;
                          return (
                            <div
                              key={row.id}
                              className="mt-3 border-t border-slate-100 pt-3"
                            >
                              <h3 className="font-semibold text-slate-900">
                                {row.label}
                              </h3>
                              <p className="mt-1 text-sm text-slate-500">
                                @{row.handle}
                              </p>
                              <p
                                className="mt-2 text-xs font-semibold text-slate-600"
                                data-testid={
                                  'profile-connection-status-' + row.id
                                }
                              >
                                {status === 'connected'
                                  ? 'Connected to Utomator'
                                  : status === 'sign-in-open'
                                    ? 'Sign-in in progress'
                                    : status === 'api-required'
                                      ? 'API connector unavailable'
                                      : 'Not connected'}
                              </p>
                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className={btn}
                                  onClick={() => onSelectAccount(row)}
                                >
                                  {status === 'connected'
                                    ? 'Manage connection'
                                    : 'Reconnect'}
                                  <ArrowRight className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  className={btn}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Disconnect and permanently remove this linked account?'
                                      )
                                    )
                                      void save('/social/' + row.id, 'DELETE');
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  Remove
                                </button>
                                <a
                                  href={row.profileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={btn}
                                  aria-label={'Open ' + row.label}
                                >
                                  <ExternalLink className="size-4" />
                                </a>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {rows.length > 1 && (
                        <p role="alert" className="mt-3 text-xs text-amber-800">
                          Legacy duplicate profiles found. Remove the unwanted
                          records before linking another account to this
                          platform.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="mt-7 flex items-start gap-2 text-xs leading-6 text-slate-500">
                <ShieldCheck className="size-4 shrink-0 text-teal-700" />A
                verified provider session is required before a social account
                can be linked or used in a workflow.
              </p>
            </section>
          )}
        </>
      )}
      <StudioDialog
        open={modal === 'profile'}
        title="Edit personal details"
        onDismiss={() => !saving && setModal(null)}
        testId="account-profile-dialog"
      >
        {profile && (
          <div className="flex flex-col gap-4">
            <Field
              label="Display name"
              value={profile.displayName}
              max={150}
              change={(displayName) =>
                setProfile((p) => p && { ...p, displayName })
              }
            />
            <Field
              label="Email"
              value={profile.email}
              change={(email) => setProfile((p) => p && { ...p, email })}
            />
            <Field
              label="Location"
              value={profile.location}
              max={180}
              change={(location) => setProfile((p) => p && { ...p, location })}
            />
            <Field
              label="About"
              value={profile.about}
              max={1200}
              lines={4}
              change={(about) => setProfile((p) => p && { ...p, about })}
            />
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              disabled={saving}
              className={btn + ' self-end bg-teal-700 text-white'}
              onClick={() => void save('/profile', 'PUT', profile)}
            >
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        )}
      </StudioDialog>
    </div>
  );
}
