'use client';

import {
  Briefcase,
  Building2,
  ChevronRight,
  MessagesSquare,
  Pencil,
  UserRound,
  Users,
} from 'lucide-react';
import { growthJourneys } from '@/components/dashboard/growth/linkedin-growth-capabilities';

const journeyIcon = {
  profile: UserRound,
  audience: Users,
  job: Briefcase,
  company: Building2,
  relationships: MessagesSquare,
} as const;

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

export function ProfileSection({
  dataLoaded,
  profile,
  onEdit,
  onRunAim,
}: {
  dataLoaded: boolean;
  profile: Profile | undefined;
  onEdit: () => void;
  onRunAim: (id: string) => void;
}) {
  return (
    <section
      aria-labelledby="account-you-heading"
      className="flex flex-col gap-4"
    >
      <h1
        id="account-you-heading"
        className="font-serif text-3xl tracking-tight text-[#111a25]"
      >
        Profile
      </h1>
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          {!dataLoaded || !profile ? (
            <div className="h-10 flex-1 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#111a25]">
                  {profile.displayName || 'Name not added'}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {[profile.headline, profile.email, profile.location]
                    .filter(Boolean)
                    .join(' · ') || 'Add email and location'}
                </p>
              </div>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </button>
            </>
          )}
        </div>
        {profile &&
        [
          profile.about,
          profile.website,
          profile.skills,
          profile.experience,
          profile.education,
        ].some(Boolean) ? (
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
                <div
                  key={label}
                  className={
                    label === 'About' || label === 'Experience'
                      ? 'sm:col-span-2'
                      : ''
                  }
                >
                  <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    {label}
                  </dt>
                  <dd className="mt-1 line-clamp-4 text-sm leading-6 text-[#111a25]">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
        ) : null}
        <ul>
          {growthJourneys.map((journey) => {
            const Icon = journeyIcon[journey.id];
            const action =
              journey.id === 'profile'
                ? 'Review'
                : journey.id === 'job'
                  ? 'Open career'
                  : 'Open';
            return (
              <li
                key={journey.id}
                className="flex items-center gap-3 border-t border-slate-100 px-5 py-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#111a25]">
                    {journey.title}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {journey.outcome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRunAim(journey.id)}
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
  );
}
