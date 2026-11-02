'use client';

import Image from 'next/image';
import {
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Waypoints,
} from 'lucide-react';
import { portraitSrc } from '@/components/dashboard/account/account-format';
import type { AccountSection } from '@/components/dashboard/account/account-format';
import type { SocialAccount } from '@/components/dashboard/account/account-home';

type ProfileSummary = {
  displayName: string;
  avatarUrl?: string;
};

export function AccountSectionNav({
  section,
  profile,
  socialAccounts,
  linkedCount,
  initial,
  onOpenSection,
}: {
  section: AccountSection;
  profile: ProfileSummary | undefined;
  socialAccounts: SocialAccount[];
  linkedCount: number;
  initial: string;
  onOpenSection: (next: AccountSection) => void;
}) {
  const menu = [
    { id: 'you' as const, label: 'Profile', icon: UserRound },
    { id: 'connections' as const, label: 'Networks', icon: Waypoints },
    { id: 'mator' as const, label: 'Mator', icon: Sparkles },
    {
      id: 'preferences' as const,
      label: 'Preferences',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <aside className="rounded-3xl bg-white p-4 shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)] lg:sticky lg:top-0">
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-[#111a25] font-serif text-xl text-white">
          {portraitSrc(profile?.avatarUrl) ||
          portraitSrc(
            socialAccounts.find((row) => portraitSrc(row.avatarUrl))?.avatarUrl
          ) ? (
            <Image
              unoptimized
              src={
                (portraitSrc(profile?.avatarUrl) ||
                  portraitSrc(
                    socialAccounts.find((row) => portraitSrc(row.avatarUrl))
                      ?.avatarUrl
                  )) ??
                ''
              }
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-2xl object-cover"
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
      <nav
        aria-label="Account"
        className="mt-3 grid grid-cols-2 gap-1 lg:grid-cols-1"
      >
        {menu.map((item) => {
          const active = section === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onOpenSection(item.id)}
              className={
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-reduce:transition-none ' +
                (active
                  ? 'bg-[#111a25] text-white'
                  : 'text-slate-700 hover:bg-slate-50')
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
