'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Compass,
  ExternalLink,
  Filter,
  LockKeyhole,
  Search,
  ShieldAlert,
  Target,
  Workflow,
} from 'lucide-react';
import {
  growthCapabilities,
  growthGuardrails,
  growthJourneys,
  profileSections,
  type GrowthCapability,
  type GrowthPillar,
  type GrowthPriority,
} from './linkedin-growth-capabilities';

const pillars: readonly { id: 'all' | GrowthPillar; label: string }[] = [
  { id: 'all', label: 'All capabilities' },
  { id: 'research', label: 'Research & intelligence' },
  { id: 'execution', label: 'Optimization & execution' },
  { id: 'measurement', label: 'Measurement' },
];
const priorities: readonly { id: 'all' | GrowthPriority; label: string }[] = [
  { id: 'all', label: 'All priorities' },
  { id: 'P0', label: 'P0 - Foundations' },
  { id: 'P1', label: 'P1 - Expansion' },
  { id: 'P2', label: 'P2 - Advanced' },
];
const badge = (item: GrowthCapability) =>
  item.status === 'partial'
    ? 'border-teal-200 bg-teal-50 text-teal-800'
    : 'border-slate-200 bg-slate-100 text-slate-600';
const control =
  'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-offset-2 focus-visible:outline-teal-700';
export default function LinkedInGrowthHub() {
  const [query, setQuery] = useState('');
  const [pillar, setPillar] = useState<'all' | GrowthPillar>('all');
  const [priority, setPriority] = useState<'all' | GrowthPriority>('all');
  const [selectedId, setSelectedId] = useState<string>('profile');
  const [expanded, setExpanded] = useState(true);
  const selected =
    growthCapabilities.find((x) => x.id === selectedId) ??
    growthCapabilities[0]!;
  const filtered = useMemo(
    () =>
      growthCapabilities.filter((row) => {
        if (pillar !== 'all' && row.pillar !== pillar) return false;
        if (priority !== 'all' && row.priority !== priority) return false;
        const q = query.toLowerCase().trim();
        return (
          !q ||
          [row.title, row.summary, ...row.actions].some((x) =>
            x.toLowerCase().includes(q)
          )
        );
      }),
    [pillar, priority, query]
  );
  function choose(id: string) {
    setSelectedId(id);
    setExpanded(true);
  }
  return (
    <div data-testid="linkedin-growth-hub" className="space-y-5 pb-8">
      <header className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[.18em] text-teal-300 uppercase">
          <Compass className="size-4" />
          LinkedIn growth system
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              From professional visibility to measurable opportunities.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Research your niche, strengthen professional evidence, publish
              responsibly, and measure outcomes. This capability map identifies
              what Utomator actually runs and what still needs implementation or
              provider access.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 self-start lg:grid-cols-1">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-slate-300">Planned product modules</p>
              <strong className="mt-1 block text-2xl tabular-nums">
                {growthCapabilities.length}
              </strong>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-slate-300">
                With working sub-workflows
              </p>
              <strong className="mt-1 block text-2xl tabular-nums">
                {
                  growthCapabilities.filter((x) => x.status === 'partial')
                    .length
                }
              </strong>
            </div>
          </div>
        </div>
      </header>

      <section
        aria-labelledby="growth-journeys"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 size-5 text-teal-700" />
          <div>
            <h2
              id="growth-journeys"
              className="text-base font-semibold text-slate-900"
            >
              Start with the outcome
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              These journeys describe intended outcomes; unfinished stages are
              not executable.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {growthJourneys.map((journey) => (
            <button
              key={journey.id}
              type="button"
              onClick={() => choose(journey.sequence[0])}
              className={
                'group min-h-28 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
                (selectedId === journey.sequence[0]
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-slate-200 bg-slate-50 hover:border-teal-400')
              }
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                {journey.title}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition group-hover:translate-x-1"
                />
              </span>
              <span className="mt-2 block text-xs leading-5 text-slate-600">
                {journey.outcome}
              </span>
              <span className="mt-3 block text-[11px] font-semibold text-teal-800">
                {journey.sequence.length} linked capability areas
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="growth-inventory" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="growth-inventory"
              className="text-lg font-semibold text-slate-900"
            >
              Capability inventory
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              An honest delivery map, not a list of automated LinkedIn
              permissions.
            </p>
          </div>
          <span
            className="text-xs font-semibold text-slate-500"
            role="status"
            aria-live="polite"
          >
            {filtered.length} of {growthCapabilities.length} modules
          </span>
        </div>
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_190px] lg:grid-cols-[minmax(0,1fr)_180px_170px]">
          <label className="relative flex min-w-0 items-center gap-2">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 size-4 text-slate-500"
            />
            <span className="sr-only">Search capabilities</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search goals, modules or actions"
              aria-label="Search capabilities"
              className={control + ' w-full pl-10'}
            />
          </label>
          <label className="block">
            <span className="sr-only">Capability pillar</span>
            <select
              aria-label="Capability pillar"
              value={pillar}
              onChange={(e) => setPillar(e.target.value as typeof pillar)}
              className={control + ' w-full'}
            >
              {pillars.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Delivery priority</span>
            <select
              aria-label="Delivery priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className={control + ' w-full'}
            >
              {priorities.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(290px,.95fr)]">
          <div
            className="grid gap-2"
            role="list"
            aria-label="LinkedIn capability modules"
          >
            {filtered.map((item) => (
              <div role="listitem" key={item.id}>
                <button
                  type="button"
                  onClick={() => choose(item.id)}
                  aria-pressed={selected.id === item.id}
                  className={
                    'flex w-full min-w-0 items-start justify-between gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
                    (selected.id === item.id
                      ? 'border-teal-600 bg-teal-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-teal-400')
                  }
                >
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-semibold text-slate-900">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      {item.summary}
                    </span>
                    <span className="mt-2 block text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      {item.priority} · {item.pillar}
                    </span>
                  </span>
                  <span
                    className={
                      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ' +
                      badge(item)
                    }
                  >
                    {item.status === 'partial'
                      ? 'Partially available'
                      : 'Planned'}
                  </span>
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Filter className="mx-auto size-6 text-slate-400" />
                <p className="mt-3 text-sm font-semibold">
                  No capability matches those filters
                </p>
                <button
                  type="button"
                  className="mt-2 min-h-11 text-sm font-semibold text-teal-700 underline"
                  onClick={() => {
                    setQuery('');
                    setPillar('all');
                    setPriority('all');
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <section
            aria-labelledby="growth-details"
            data-testid="growth-capability-details"
            className="rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                {selected.priority}
              </span>
              <span
                className={
                  'rounded-full border px-2.5 py-1 text-xs font-semibold ' +
                  badge(selected)
                }
              >
                {selected.status === 'partial'
                  ? 'Partially available'
                  : 'Not implemented'}
              </span>
            </div>
            <h3
              id="growth-details"
              className="mt-3 text-lg font-semibold text-slate-900"
            >
              {selected.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {selected.summary}
            </p>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-700 uppercase">
                <CheckCircle2 className="size-4" />
                Available today
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {selected.availableNow}
              </p>
              {selected.route && (
                <a
                  href={selected.route}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  Open available workflow <ExternalLink className="size-4" />
                </a>
              )}
            </div>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-amber-900 uppercase">
                <LockKeyhole className="size-4" />
                Before full delivery
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-950">
                {selected.requires}
              </p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700"
                aria-expanded={expanded}
                aria-controls="growth-action-inventory"
                onClick={() => setExpanded((x) => !x)}
              >
                Proposed action inventory{' '}
                <span className="text-xs text-slate-500">
                  {selected.actions.length} actions ·{' '}
                  {expanded ? 'Hide' : 'Show'}
                </span>
              </button>
              {expanded && (
                <ul id="growth-action-inventory" className="mt-2 space-y-3">
                  {selected.actions.map((action) => (
                    <li
                      key={action}
                      className="flex items-start gap-2 text-sm leading-5 text-slate-700"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-700"
                      />
                      {action}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected.id === 'profile' && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-sm font-bold text-slate-900">
                  20 sections in the target audit
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  These are coverage requirements, not already-audited sections.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profileSections.map((section) => (
                    <span
                      key={section}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {section}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
      <section
        aria-labelledby="growth-guardrails"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-slate-700" />
          <div>
            <h2 id="growth-guardrails" className="text-base font-semibold">
              Operating boundaries
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              API-supported, research-assisted and owner-operated tasks have
              different permissions.
            </p>
          </div>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {growthGuardrails.map((rule) => (
            <li
              key={rule}
              className="flex gap-2 text-sm leading-5 text-slate-700"
            >
              <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
              {rule}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <Workflow className="mt-0.5 size-4 shrink-0" />
          The capability map is a planning and navigation surface. It never
          triggers a LinkedIn action on its own.
        </p>
      </section>
    </div>
  );
}
