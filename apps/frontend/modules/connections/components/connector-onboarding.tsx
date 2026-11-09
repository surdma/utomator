'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LinkedInIcon } from '@/components/svgs';
import StudioDialog from '@/components/ui/studio-dialog';
import { type ProviderKey, providerMeta } from './provider-meta';
import ConnectorNetworkPicker from './sections/connector-network-picker';
import ConnectorOtherNetworks from './sections/connector-other-networks';
import ConnectorSavedAccount from './sections/connector-saved-account';

export type { Connector } from './connector-types';

import type { Connector } from './connector-types';

type Command = 'connect' | 'sync' | 'disconnect';
type Result = { status?: string; navigationWarning?: string; error?: string };
type Capabilities = {
  browserAvailable: boolean;
  mode: 'attached' | 'isolated';
  mobileBrowserSession: boolean;
};
const path = '/api/connectors';
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] disabled:cursor-not-allowed disabled:opacity-50';
export default function ConnectorOnboarding({
  activeId,
  onSelect,
  requestedId,
  hideTrigger = false,
  openSignal = 0,
  onManageProfile,
}: {
  activeId: string | null;
  onSelect: (item: Connector) => void;
  requestedId?: string | null;
  hideTrigger?: boolean;
  openSignal?: number;
  onManageProfile?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Connector[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [working, setWorking] = useState<Command | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [network, setNetwork] = useState<ProviderKey>('linkedin');
  const [showOtherNetworks, setShowOtherNetworks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [mobileClient, setMobileClient] = useState(false);
  const [oauth, setOauth] = useState<{
    connected: boolean;
    configured: boolean;
    subject?: string;
    expiresAt?: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handled = useRef(openSignal);
  const last = useRef({ activeId, onSelect, accounts });
  useEffect(() => {
    last.current = { activeId, onSelect, accounts };
  }, [activeId, onSelect, accounts]);
  useEffect(() => {
    setMobileClient(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    let live = true;
    void fetch(`${path}/capabilities`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('Capabilities unavailable');
        return response.json() as Promise<Capabilities>;
      })
      .then((value) => {
        if (live) setCapabilities(value);
      })
      .catch(() => {
        if (live)
          setCapabilities({
            browserAvailable: false,
            mode: 'isolated',
            mobileBrowserSession: false,
          });
      });
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(path, { cache: 'no-store' });
    const data = (await response.json()) as Connector[] & { error?: string };
    if (!response.ok || !Array.isArray(data))
      throw Error(data.error || 'Social connections unavailable');
    setAccounts(data);
    const linkedin = data.filter((item) => item.platform === 'linkedin');
    const previous = last.current.accounts.find(
      (item) => item.id === last.current.activeId,
    );
    const current = data.find((item) => item.id === last.current.activeId);
    if (
      current &&
      previous &&
      (current.status !== previous.status ||
        current.verifiedAt !== previous.verifiedAt)
    )
      last.current.onSelect(current);
    if (!last.current.activeId) {
      const linked = linkedin.find((item) => item.status === 'connected');
      if (linked) last.current.onSelect(linked);
    }
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    void refresh()
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Unable to load connections',
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    // The backend is authoritative even after another browser tab or device
    // updates the connection. This component is mounted across all app panes.
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      15000,
    );
    return () => {
      active = false;
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (openSignal === handled.current) return;
    handled.current = openSignal;
    setOpen(true);
    setConfirming(false);
    setError('');
    setMessage('');
    const target = requestedId || last.current.activeId;
    setSelected(target);
    const match = last.current.accounts.find((item) => item.id === target);
    if (match) setNetwork(match.platform);
    void refresh().catch((e) =>
      setError(e instanceof Error ? e.message : 'Unable to load connections'),
    );
  }, [openSignal, requestedId, refresh]);

  // Check the provider tab without touching it until ownership can be proven.
  const pendingIds = accounts
    .filter((item) => item.status === 'sign-in-open')
    .map((item) => item.id)
    .join(',');
  useEffect(() => {
    if (!pendingIds) return;
    let live = true,
      inFlight = false;
    const check = async () => {
      if (!live || inFlight) return;
      inFlight = true;
      try {
        for (const id of pendingIds.split(',')) {
          const response = await fetch(
            `${path}/${encodeURIComponent(id)}/check`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            },
          );
          if (!response.ok) continue;
          const result = (await response.json()) as Result;
          if (result.status === 'connected') {
            const updated = (await refresh()).find((item) => item.id === id);
            if (live && updated?.status === 'connected') {
              setSelected(id);
              setNetwork(updated.platform);
              setMessage(
                `${providerMeta[updated.platform].name} session verified.`,
              );
              onSelect(updated);
            }
          }
        }
      } catch {
        /* Keep waiting on network outages; manual retry remains available. */
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void check(), 3500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pendingIds, refresh, onSelect]);
  const available = accounts.filter((item) => item.platform === network);
  const chosen =
    available.find((item) => item.id === selected) ||
    available.find((item) => item.id === activeId) ||
    available[0] ||
    null;

  async function command(id: string, operation: Command) {
    if (working || saving) return;
    setError('');
    setMessage('');
    setConfirming(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(operation);
    setWorkingId(id);
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(
        `${path}/${encodeURIComponent(id)}/${operation}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        },
      );
      const result = (await response.json()) as Result;
      if (!response.ok)
        throw Error(result.error || 'LinkedIn connection request failed');
      const updated = (await refresh()).find((row) => row.id === id);
      if (result.status === 'connected') {
        if (updated) onSelect(updated);
        setSelected(id);
        setMessage(
          providerMeta[updated?.platform || network].name +
            ' session verified.',
        );
      } else if (result.status === 'sign-in-open') {
        setSelected(id);
        setMessage(
          result.navigationWarning ||
            'Finish signing in to LinkedIn in the secure window, then select Verify connection.',
        );
      } else if (result.status === 'reconnect-required') {
        setSelected(id);
        setError(
          'LinkedIn sign-in is incomplete or expired. Finish sign-in, then verify again.',
        );
      } else if (result.status === 'temporarily-unavailable') {
        setError(
          'LinkedIn could not be reached. Your previous connection record was preserved.',
        );
      } else if (result.status === 'disconnected') {
        if (updated && activeId === id) onSelect(updated);
        setMessage('LinkedIn disconnected from this workspace.');
      } else throw Error('Unexpected connection response');
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Connection check stopped. You can retry.'
          : e instanceof Error
            ? e.message
            : 'LinkedIn connection failed',
      );
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setWorking(null);
      setWorkingId(null);
    }
  }
  async function beginNewConnection(provider: 'linkedin' | 'x') {
    if (working || saving || !capabilities?.browserAvailable || mobileClient)
      return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch(`${path}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: provider }),
      });
      const result = (await response.json()) as Result & { accountId?: string };
      if (!response.ok || !result.accountId)
        throw Error(result.error || 'Could not open provider sign-in');
      setNetwork(provider);
      setSelected(result.accountId);
      await refresh();
      setMessage(
        result.navigationWarning ||
          'Complete provider sign-in in Chrome, then select Verify connection.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start connection');
    } finally {
      setSaving(false);
    }
  }

  const busy = Boolean(working) || saving;
  const status = chosen?.status;
  useEffect(() => {
    if (
      !chosen?.id ||
      chosen.platform !== 'linkedin' ||
      chosen.status === 'sign-in-open'
    ) {
      setOauth(null);
      return;
    }
    let live = true;
    void fetch(
      `/api/linkedin/oauth/status?accountId=${encodeURIComponent(chosen.id)}`,
      { cache: 'no-store' },
    )
      .then(async (response) => {
        if (!response.ok) throw Error('Publishing status unavailable');
        return response.json() as Promise<{
          connected: boolean;
          configured: boolean;
          subject?: string;
          expiresAt?: string;
        }>;
      })
      .then((result) => {
        if (live) setOauth(result);
      })
      .catch(() => {
        if (live) setOauth(null);
      });
    return () => {
      live = false;
    };
  }, [chosen?.id, chosen?.platform, chosen?.status]);
  async function authorizePublishing(id: string) {
    if (busy) return;
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/linkedin/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      const result = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.authorizationUrl)
        throw Error(result.error || 'Authorization unavailable');
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to authorize LinkedIn');
      setSaving(false);
    }
  }
  const operation: Command =
    status === 'connected' || status === 'sign-in-open' ? 'sync' : 'connect';
  const actionText =
    operation === 'connect'
      ? `Connect ${providerMeta[network].name}`
      : status === 'connected'
        ? 'Check connection'
        : 'Verify connection';
  const browserLoginAvailable =
    chosen?.interactiveSignIn !== false &&
    capabilities?.browserAvailable === true &&
    !mobileClient;
  const canStart = Boolean(capabilities?.browserAvailable) && !mobileClient;
  const browserSupported = network === 'linkedin' || network === 'x';

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void refresh().catch((e) =>
              setError(
                e instanceof Error ? e.message : 'Unable to load connections',
              ),
            );
          }}
          aria-label="Manage connected social accounts"
          className={`${button} border border-slate-200 bg-white text-slate-900`}
        >
          <LinkedInIcon className="size-5" /> LinkedIn{' '}
          {chosen?.status === 'connected' ? 'connected' : 'connection'}
        </button>
      )}
      <StudioDialog
        open={open}
        onDismiss={() => {
          if (!busy) setOpen(false);
        }}
        dismissible={!busy}
        testId="connector-onboarding-dialog"
        title="Connect your social accounts"
        titleSize="prominent"
      >
        <div
          data-testid="linkedin-connector"
          className="mx-auto flex max-w-2xl flex-col gap-4"
        >
          <ConnectorNetworkPicker
            network={network}
            setNetwork={setNetwork}
            setSelected={setSelected}
            setConfirming={setConfirming}
            setError={setError}
            setMessage={setMessage}
          />

          <ConnectorSavedAccount
            network={network}
            ready={ready}
            available={available}
            chosen={chosen}
            activeId={activeId}
            status={status}
            oauth={oauth}
            busy={busy}
            saving={saving}
            working={working}
            workingId={workingId}
            operation={operation}
            actionText={actionText}
            browserLoginAvailable={browserLoginAvailable}
            canStart={canStart}
            browserSupported={browserSupported}
            confirming={confirming}
            mobileClient={mobileClient}
            capabilities={capabilities}
            setSelected={setSelected}
            setConfirming={setConfirming}
            setError={setError}
            setMessage={setMessage}
            command={(id, op) => void command(id, op)}
            beginNewConnection={(provider) => void beginNewConnection(provider)}
            authorizePublishing={(id) => void authorizePublishing(id)}
            onSelect={onSelect}
            abortRef={abortRef}
            onManageProfile={onManageProfile}
            setOpen={setOpen}
            error={error}
            message={message}
          />

          <ConnectorOtherNetworks
            network={network}
            showOtherNetworks={showOtherNetworks}
            setShowOtherNetworks={setShowOtherNetworks}
            setNetwork={setNetwork}
            setSelected={setSelected}
            setConfirming={setConfirming}
            setError={setError}
            setMessage={setMessage}
          />

          <p className="px-1 text-xs leading-5 text-slate-600">
            Utomator does not collect your social password. Local Chrome
            attachment is optional. Hosted and mobile connections require
            supported provider authorization; workflows still require your
            review.
          </p>
        </div>
      </StudioDialog>
    </>
  );
}
