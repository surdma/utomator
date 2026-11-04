'use client';

import { LoaderCircle } from 'lucide-react';
import type { RefObject } from 'react';
import type { Connector } from '../connector-types';
import { type ProviderKey, providerMeta } from '../provider-meta';
import ConnectorStatusNotices from './connector-status-notices';

type Command = 'connect' | 'sync' | 'disconnect';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] disabled:cursor-not-allowed disabled:opacity-50';
const shortDate = (value: string | null) =>
  value ? `Checked ${new Date(value).toLocaleString()}` : 'Not verified';

export default function ConnectorSavedAccount({
  network,
  ready,
  available,
  chosen,
  activeId,
  status,
  oauth,
  busy,
  saving,
  working,
  workingId,
  operation,
  actionText,
  browserLoginAvailable,
  canStart,
  browserSupported,
  confirming,
  mobileClient,
  capabilities,
  setSelected,
  setConfirming,
  setError,
  setMessage,
  command,
  beginNewConnection,
  authorizePublishing,
  onSelect,
  abortRef,
  onManageProfile,
  setOpen,
  error,
  message,
}: {
  network: ProviderKey;
  ready: boolean;
  available: Connector[];
  chosen: Connector | null;
  activeId: string | null;
  status: Connector['status'] | undefined;
  oauth: {
    connected: boolean;
    configured: boolean;
    subject?: string;
    expiresAt?: string;
  } | null;
  busy: boolean;
  saving: boolean;
  working: Command | null;
  workingId: string | null;
  operation: Command;
  actionText: string;
  browserLoginAvailable: boolean;
  canStart: boolean;
  browserSupported: boolean;
  confirming: boolean;
  mobileClient: boolean;
  capabilities: {
    browserAvailable: boolean;
    mode: 'attached' | 'isolated';
    mobileBrowserSession: boolean;
  } | null;
  setSelected: (id: string | null) => void;
  setConfirming: (value: boolean) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  command: (id: string, operation: Command) => void;
  beginNewConnection: (provider: 'linkedin' | 'x') => void;
  authorizePublishing: (id: string) => void;
  onSelect: (item: Connector) => void;
  abortRef: RefObject<AbortController | null>;
  onManageProfile?: () => void;
  setOpen: (open: boolean) => void;
  error: string;
  message: string;
}) {
  return (
    <section
      aria-label={`${providerMeta[network].name} connection`}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-lg leading-7 font-semibold text-slate-950">
            {providerMeta[network].name}
          </h3>
        </div>
        <span
          data-testid="connector-status"
          className={
            'inline-flex min-h-8 max-w-full items-center rounded-full px-3 py-1 text-xs leading-5 font-semibold ' +
            (status === 'connected'
              ? 'bg-emerald-100 text-emerald-900'
              : status === 'sign-in-open'
                ? 'bg-amber-100 text-amber-950'
                : status === 'api-required' || !browserSupported
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 ring-inset')
          }
        >
          {status === 'connected'
            ? 'Session connected'
            : status === 'sign-in-open'
              ? 'Sign-in in progress'
              : status === 'api-required' || !browserSupported
                ? 'Unavailable'
                : oauth?.connected
                  ? 'Publishing connected'
                  : 'Not connected'}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {!ready ? (
          <p role="status" className="py-6 text-center text-sm text-slate-600">
            Checking your connections...
          </p>
        ) : (
          <>
            {available.length > 1 && (
              <>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  Legacy linked accounts
                  <select
                    aria-label="Legacy linked account"
                    value={chosen?.id || ''}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setConfirming(false);
                      setError('');
                    }}
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  >
                    {available.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} (@{item.handle})
                      </option>
                    ))}
                  </select>
                </label>
                <p
                  role="alert"
                  className="rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900"
                >
                  Legacy duplicates detected. Remove the extra identities from
                  your profile before linking a replacement.
                </p>
              </>
            )}
            {chosen ? (
              <div className="min-w-0">
                <p className="text-base leading-6 font-semibold [overflow-wrap:anywhere] break-words text-slate-950">
                  {chosen.label}
                </p>
                {chosen.handle && (
                  <p className="mt-1 text-sm leading-5 [overflow-wrap:anywhere] break-words text-slate-600">
                    @{chosen.handle}
                  </p>
                )}
                {activeId === chosen.id && status === 'connected' && (
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    In use in your workspace
                  </p>
                )}
                <p
                  className="mt-3 text-sm leading-6 text-slate-600"
                  title={chosen.verifiedAt || undefined}
                >
                  {status === 'connected'
                    ? shortDate(chosen.verifiedAt)
                    : status === 'sign-in-open'
                      ? 'Finish signing in with the provider. We will check for completion automatically.'
                      : 'This account needs a verified session before workflows can run.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {browserSupported ? (
                  <p className="text-sm leading-6 text-slate-600">
                    No {providerMeta[network].name} account connected. Connect
                    to detect your verified profile automatically.
                  </p>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    Official API connector not available yet. Sync is disabled.
                  </p>
                )}
                {browserSupported && (
                  <button
                    type="button"
                    disabled={busy || !canStart}
                    className={
                      button +
                      ' w-full bg-slate-950 text-white hover:bg-slate-800'
                    }
                    onClick={() =>
                      void beginNewConnection(network as 'linkedin' | 'x')
                    }
                  >
                    {saving ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    Connect {providerMeta[network].name}
                  </button>
                )}
              </div>
            )}
            <ConnectorStatusNotices error={error} message={message} />

            {chosen && browserSupported && (
              <div className="flex flex-col gap-3">
                {browserLoginAvailable ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void command(chosen.id, operation)}
                    className={
                      button +
                      ' w-full bg-slate-950 text-white hover:bg-slate-800'
                    }
                  >
                    {working && workingId === chosen.id ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {working && workingId === chosen.id
                      ? 'Checking connection...'
                      : actionText}
                  </button>
                ) : network === 'linkedin' ? (
                  <button
                    type="button"
                    disabled={busy || !oauth?.configured}
                    onClick={() => void authorizePublishing(chosen.id)}
                    className={
                      button +
                      ' w-full bg-slate-950 text-white hover:bg-slate-800'
                    }
                  >
                    {oauth?.connected
                      ? 'Renew LinkedIn publishing'
                      : 'Connect LinkedIn for publishing'}
                  </button>
                ) : (
                  <p className="text-sm leading-6 text-amber-900">
                    Local desktop connector unavailable. This provider cannot
                    use mobile browser cookies.
                  </p>
                )}
                {!browserLoginAvailable && (
                  <p className="text-sm leading-6 text-slate-600">
                    Browser-based workflows need an interactive connection host.
                    Publishing authorization does not grant browser access.
                  </p>
                )}
                {working && (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className={
                      button +
                      ' w-full border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }
                  >
                    Cancel
                  </button>
                )}
                {network === 'linkedin' &&
                  status === 'connected' &&
                  activeId !== chosen.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onSelect(chosen);
                        setMessage('LinkedIn is selected for your workspace.');
                      }}
                      className={
                        button +
                        ' w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }
                    >
                      Use this account
                    </button>
                  )}
                {status === 'sign-in-open' && (
                  <>
                    <p
                      role="status"
                      className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-950"
                    >
                      Automatically checking sign-in. You can also verify now.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void command(chosen.id, 'disconnect')}
                      className={
                        button +
                        ' w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }
                    >
                      Cancel connection
                    </button>
                  </>
                )}
                {network === 'linkedin' &&
                  browserLoginAvailable &&
                  oauth?.configured && (
                    <details className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                      <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-800">
                        Publishing access:{' '}
                        {oauth.connected ? 'Authorized' : 'Not authorized'}
                      </summary>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void authorizePublishing(chosen.id)}
                        className={
                          button +
                          ' mt-2 w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                        }
                      >
                        {oauth.connected
                          ? 'Renew publishing access'
                          : 'Authorize publishing'}
                      </button>
                    </details>
                  )}
                {confirming ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void command(chosen.id, 'disconnect')}
                      className={
                        button +
                        ' border border-rose-300 bg-rose-50 px-2 text-rose-900 hover:bg-rose-100'
                      }
                    >
                      Confirm disconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className={
                        button +
                        ' border border-slate-200 px-2 text-slate-800 hover:bg-slate-50'
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  status === 'connected' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(true)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                    >
                      Disconnect
                    </button>
                  )
                )}
              </div>
            )}
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
              <p>
                {mobileClient
                  ? 'Mobile Chrome and Safari cannot share their authenticated tabs with server-side Playwright. Local browser linking requires a desktop session.'
                  : !capabilities?.browserAvailable
                    ? 'This server cannot open an interactive login on your device. Use a local desktop agent or a supported provider authorization.'
                    : capabilities.mode === 'attached'
                      ? 'Local Chrome attachment enabled. Sign-in opens in a new tab in your authorized Chrome profile.'
                      : 'Isolated Chrome mode uses a separate browser profile. To reuse a Chrome login, opt in to local Chrome attachment.'}
              </p>
            </div>
            {onManageProfile && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManageProfile();
                }}
                className={
                  button +
                  ' w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }
              >
                Manage profiles
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
