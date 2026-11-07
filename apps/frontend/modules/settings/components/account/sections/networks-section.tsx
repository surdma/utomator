'use client';

import Image from 'next/image';
import { primaryOperation, providerMeta } from '@/modules/connections';
import type { ConnectionStatus } from '@/modules/settings/components/account/account-format';
import {
  portraitSrc,
  statusLine,
} from '@/modules/settings/components/account/account-format';
import type { SocialAccount } from '@/modules/settings/components/account/account-home';

const platforms = ['linkedin', 'x', 'instagram', 'github', 'devto'] as const;

type Connection = {
  id: string;
  platform?: string;
  handle?: string;
  status: ConnectionStatus;
  verifiedAt: string | null;
  avatarUrl?: string;
};

export function NetworksSection({
  available,
  socialAccounts,
  connections,
  linkBusy,
  pendingSync,
  linkedAccountId,
  selectedAccount,
  onConnect,
  onOpenProviderTab,
  onBeginSync,
  onRequestDisconnect,
}: {
  available: 'checking' | 'ready' | 'offline';
  socialAccounts: SocialAccount[] | undefined;
  connections: Connection[];
  linkBusy: string | null;
  pendingSync: Partial<Record<'linkedin' | 'x', string>>;
  linkedAccountId?: string | null;
  selectedAccount: {
    platform: string;
    label: string;
    handle: string;
    profileUrl: string;
    status: string;
  } | null;
  onConnect: () => void;
  onOpenProviderTab: (platform: 'linkedin' | 'x') => boolean;
  onBeginSync: (platform: 'linkedin' | 'x', accountId?: string) => void;
  onRequestDisconnect: (id: string) => void;
}) {
  return (
    <section
      aria-labelledby="account-networks-heading"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1
          id="account-networks-heading"
          className="font-serif text-3xl tracking-tight text-[#111a25]"
        >
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
        <p
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"
        >
          Utomator is not running on this computer, so live connection status
          may be out of date. Saved accounts are still listed.
        </p>
      ) : null}
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)]">
        {platforms.map((platformKey) => {
          const meta = providerMeta[platformKey];
          const Icon = meta.icon;
          const rows =
            socialAccounts?.filter((row) => row.platform === platformKey) ?? [];
          return (
            <li key={platformKey} className="px-5 py-4">
              {rows.length === 0 ? (
                <div className="flex items-center gap-4">
                  <span
                    className={
                      'flex size-11 shrink-0 items-center justify-center rounded-xl ' +
                      meta.tile
                    }
                  >
                    <Icon className="size-5!" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-[#111a25]">
                      {meta.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      No verified account linked.
                    </p>
                  </div>
                  {platformKey === 'linkedin' || platformKey === 'x' ? (
                    <button
                      type="button"
                      disabled={
                        linkBusy === platformKey ||
                        linkBusy === pendingSync[platformKey]
                      }
                      onClick={() => {
                        onOpenProviderTab(platformKey);
                        void onBeginSync(platformKey);
                      }}
                      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl bg-[#111a25] px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {linkBusy === platformKey ||
                      linkBusy === pendingSync[platformKey]
                        ? 'Working…'
                        : 'Sync'}
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
                      primaryOperation(
                        live?.status ?? 'disconnected',
                        live?.verifiedAt ?? null,
                      ) === 'disconnect';
                    const portrait = portraitSrc(row.avatarUrl);
                    return (
                      <div key={row.id} className="flex items-center gap-4">
                        <span
                          className={
                            'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full ' +
                            (portrait ? '' : meta.tile)
                          }
                        >
                          {portrait ? (
                            <Image
                              unoptimized
                              src={portrait}
                              alt=""
                              width={44}
                              height={44}
                              className="size-11 rounded-full object-cover"
                            />
                          ) : (
                            <Icon className="size-5!" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-base font-semibold text-[#111a25]">
                              {meta.name}
                            </h2>
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
                              onClick={() => onRequestDisconnect(row.id)}
                              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {linkBusy === row.id ? 'Working…' : 'Disconnect'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={linkBusy === row.id}
                              onClick={() => {
                                onOpenProviderTab(
                                  row.platform as 'linkedin' | 'x',
                                );
                                void onBeginSync(
                                  row.platform as 'linkedin' | 'x',
                                  row.id,
                                );
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
                    <p
                      role="alert"
                      className="text-sm leading-6 text-amber-900"
                    >
                      More than one account is saved here. Remove the extra one
                      before connecting another.
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
