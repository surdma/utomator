'use client';

import {
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import {
  growthCapabilities,
  growthGuardrails,
  growthJourneys,
  profileSections,
} from './linkedin-growth-capabilities';

export function capabilityForSlug(slug: string) {
  return growthCapabilities.find((item) => slug === `growth-${item.id}`);
}

export default function GrowthCapabilityDetails({ slug }: { slug: string }) {
  const capability = capabilityForSlug(slug);
  if (!capability) return null;
  const journeys = growthJourneys.filter((journey) =>
    (journey.sequence as readonly string[]).includes(capability.id),
  );
  return (
    <section
      data-testid="growth-capability-details"
      aria-labelledby="growth-detail-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-md border border-slate-200 px-2.5 py-1">
            {capability.priority}
          </span>
          <span className="rounded-md border border-slate-200 px-2.5 py-1 capitalize">
            {capability.pillar}
          </span>
          <span className="rounded-md border border-slate-200 px-2.5 py-1">
            {capability.status === 'partial'
              ? 'Partially available'
              : 'Planned'}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          {capability.actions.length} proposed actions
        </span>
      </div>
      <h2
        id="growth-detail-heading"
        className="mt-5 text-xl font-semibold tracking-tight text-slate-950"
      >
        {capability.title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        {capability.summary}
      </p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-teal-700" />
            Available today
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {capability.availableNow}
          </p>
          {capability.route && (
            <a
              href={capability.route}
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-4"
            >
              Open existing supported workflow{' '}
              <ArrowUpRight className="size-4" />
            </a>
          )}
          {capability.id === 'profile' && (
            <a
              href="/dashboard/workspace"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-4"
            >
              Open profile Growth pipelines <ArrowUpRight className="size-4" />
            </a>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <LockKeyhole className="size-4" />
            Required before full delivery
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {capability.requires}
          </p>
        </div>
      </div>
      <details open className="mt-4 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          Proposed actions and pipeline requirements (
          {capability.actions.length})
        </summary>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {capability.actions.map((action, index) => (
            <li
              key={action}
              className="flex items-start gap-3 text-sm leading-6 text-slate-700"
            >
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              {action}
            </li>
          ))}
        </ol>
      </details>
      {capability.id === 'profile' && (
        <details open className="mt-4 rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            20 profile sections requiring independent evidence and coverage
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Target requirements. These are not claims that all sections have
            been audited.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {profileSections.map((section, index) => (
              <div
                key={section}
                className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"
              >
                <span className="mr-1 text-slate-400">{index + 1}.</span>
                {section}
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600">
        <CircleHelp className="mt-0.5 size-4 shrink-0" />
        Modes:{' '}
        {capability.modes.map((mode) => mode.replaceAll('-', ' ')).join(' · ')}.
        A visual graph never authorizes remote execution.
      </p>
      {journeys.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Related journeys:{' '}
          {journeys.map((journey) => journey.title).join(' · ')}
        </p>
      )}
      <details className="mt-5 border-t border-slate-100 pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="size-4" />
          Permissions, evidence and operating boundaries
        </summary>
        <ul className="mt-3 space-y-2">
          {growthGuardrails.map((rule) => (
            <li key={rule} className="text-xs leading-5 text-slate-600">
              • {rule}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
