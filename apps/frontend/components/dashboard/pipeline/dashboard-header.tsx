'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, History, RotateCcw, UserRound } from 'lucide-react';
import { AppMark } from '@/components/logo';
import { Popover } from '@/components/ui/popover';
import { portraitSrc } from '@/components/dashboard/account/account-format';

type AccountSummary = {
  displayName?: string;
  avatarUrl?: string;
};

type Props = {
  available: 'checking' | 'ready' | 'offline';
  onRefresh: () => void;
  onOpenHistory: () => void;
  onOpenAccount: () => void;
};

const statusText: Record<Props['available'], string> = {
  checking: 'Connecting to the engine',
  ready: 'Engine connected',
  offline: 'Engine offline',
};

export default function DashboardHeader({
  available,
  onRefresh,
  onOpenHistory,
  onOpenAccount,
}: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [profile, setProfile] = useState<AccountSummary | null>(null);

  useEffect(() => {
    // Account details only decorate the menu; a failure keeps the neutral initial.
    let alive = true;
    fetch('/api/account', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { profile?: AccountSummary } | null) => {
        if (alive && value?.profile) setProfile(value.profile);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const displayName = profile?.displayName?.trim() || 'Account';
  const initial = displayName.charAt(0).toUpperCase();
  const avatar = portraitSrc(profile?.avatarUrl);

  const closeAnd = (action: () => void) => {
    setAccountOpen(false);
    action();
  };

  const menuItem =
    'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none';

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <AppMark className="size-10" />
          <div>
            <p className="text-sm leading-tight font-extrabold tracking-[-.02em]">
              Utomator{' '}
              <span className="font-medium text-slate-400">/ Studio</span>
            </p>
            <p className="text-[11px] text-slate-500">
              Local automation, evidence first
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Engine status reduced to a dot; the text stays for screen
              readers and hover so meaning is never color-only. */}
          <span
            role="status"
            title={statusText[available]}
            className="flex size-6 items-center justify-center"
          >
            <span
              className={
                'size-2.5 rounded-full ring-2 ring-white ' +
                (available === 'ready' ? 'bg-emerald-500' : 'bg-amber-500')
              }
            />
            <span className="sr-only">{statusText[available]}</span>
          </span>

          <Popover
            open={accountOpen}
            onOpenChange={setAccountOpen}
            align="end"
            aria-label="Account menu"
            contentClassName="w-60"
            trigger={
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={accountOpen}
                aria-label="Account menu"
                onClick={() => setAccountOpen((value) => !value)}
                className="block cursor-pointer rounded-full text-slate-300 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none"
              >
                <span className="inline-flex size-11 items-center justify-center">
                  <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-[#111a25] font-serif text-sm text-white">
                    {avatar ? (
                      <Image
                        unoptimized
                        src={avatar}
                        alt=""
                        width={36}
                        height={36}
                        className="size-9 rounded-xl object-cover"
                      />
                    ) : (
                      initial
                    )}
                  </span>
                </span>
              </button>
            }
          >
            <div className="flex flex-col px-1.5 py-1">
              <div className="flex items-center gap-2.5 px-2 py-2.5">
                <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-[#111a25] font-serif text-sm text-white">
                  {avatar ? (
                    <Image
                      unoptimized
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="size-9 rounded-xl object-cover"
                    />
                  ) : (
                    initial
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111a25]">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-500">Local studio</p>
                </div>
              </div>
              <div className="mb-1 border-t border-slate-100 pt-1.5">
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => closeAnd(onOpenHistory)}
                >
                  <History className="size-4 shrink-0" aria-hidden="true" />
                  Run history
                </button>
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => closeAnd(onRefresh)}
                >
                  <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                  Refresh workspace
                </button>
              </div>
              <div className="border-t border-slate-100 pt-1.5">
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => closeAnd(onOpenAccount)}
                >
                  <UserRound className="size-4 shrink-0" aria-hidden="true" />
                  Account
                </button>
                <Link
                  href="/"
                  className={menuItem}
                  onClick={() => setAccountOpen(false)}
                >
                  <ExternalLink
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Portfolio
                  <span className="ml-auto text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                    Open
                  </span>
                </Link>
              </div>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}
