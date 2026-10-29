'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  Clock3,
  ExternalLink,
  Filter,
  NotebookPen,
  Search,
  ShieldCheck,
} from 'lucide-react';

type Platform = 'linkedin' | 'x';
type MemoryNote = {
  id: string;
  createdAt: string;
  platform: Platform;
  scope: string;
  text: string;
};
type Observation = {
  runId: string;
  timestamp: string;
  platform: Platform;
  url: string;
  title: string | null;
  headline: string | null;
  bio: string | null;
  source: 'browser-audit';
};
const input =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15';
function Frame({
  kicker,
  heading,
  description,
  children,
}: {
  kicker: string;
  heading: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header className="rounded-[24px] border border-slate-200 bg-[#111e2b] px-6 py-7 text-white">
        <p className="text-[11px] font-bold tracking-[.18em] text-teal-300 uppercase">
          {kicker}
        </p>
        <h1 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
          {heading}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          {description}
        </p>
      </header>
      {children}
    </div>
  );
}

export function MemoryStudio({
  notes,
  platform,
  handle,
  draft,
  onDraftChange,
  onSave,
  feedback,
}: {
  notes: MemoryNote[];
  platform: Platform;
  handle: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  feedback?: { kind: 'success' | 'error'; message: string } | null;
}) {
  const [search, setSearch] = useState('');
  const matches = useMemo(
    () =>
      notes
        .filter(
          (note) =>
            note.platform === platform &&
            note.scope.toLowerCase().includes(handle.toLowerCase()) &&
            note.text.toLowerCase().includes(search.toLowerCase())
        )
        .slice()
        .reverse(),
    [notes, platform, handle, search]
  );
  return (
    <Frame
      kicker="Owner-authored context"
      heading="Identity memory."
      description="Keep your instructions, corrections and preferences here. Memory is written by you, not inferred from a browser observation, and never changes a résumé automatically."
    >
      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border p-3 text-sm ${feedback.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-teal-200 bg-teal-50 text-teal-800'}`}
        >
          {feedback.message}
        </p>
      )}
      <section
        data-testid="identity-memory"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen className="size-5 text-teal-700" />
          <h2 className="text-sm font-bold">Add a verified note</h2>
        </div>
        <label
          htmlFor="identityNote"
          className="mb-2 block text-xs font-semibold text-slate-700"
        >
          What should Utomator remember?
        </label>
        <textarea
          id="identityNote"
          className={input + ' resize-y leading-6'}
          rows={4}
          maxLength={800}
          value={draft}
          placeholder="Example: prefer short, evidence-backed descriptions; never infer employment dates."
          onChange={(e) => onDraftChange(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {draft.length}/800 · Saved only to the selected profile scope
          </p>
          <button
            type="button"
            disabled={draft.trim().length < 3}
            onClick={onSave}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-40"
          >
            <NotebookPen className="size-4" />
            Save note locally
          </button>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Saved memory</h2>
            <p className="mt-1 text-xs text-slate-500">
              {matches.length} note(s) for{' '}
              {platform === 'linkedin' ? 'LinkedIn' : 'X'} · @{handle}
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute top-3 left-3 size-4 text-slate-400" />
            <label className="sr-only" htmlFor="memorySearch">
              Search memory
            </label>
            <input
              id="memorySearch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes"
              className={input + ' pl-9'}
            />
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-5 py-12 text-center">
            <BookOpen className="mx-auto size-7 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              No matching memory notes
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Add a note above or adjust your search.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((note) => (
              <article
                key={note.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <p className="text-sm leading-6 whitespace-pre-wrap text-slate-800">
                  {note.text}
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Clock3 className="size-3.5" />
                  Owner note · {new Date(note.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
        Notes belong to the owner and are not observations, external website
        changes, or evidence for career claims.
      </p>
    </Frame>
  );
}

export function ObserverStudio({
  observations,
  platform,
  handle,
}: {
  observations: Observation[];
  platform: Platform;
  handle: string;
}) {
  const [search, setSearch] = useState('');
  const scoped = useMemo(
    () =>
      observations.filter(
        (item) =>
          item.platform === platform &&
          item.url.toLowerCase().includes(handle.toLowerCase())
      ),
    [observations, platform, handle]
  );
  const matches = scoped.filter((item) =>
    `${item.title || ''} ${item.headline || ''} ${item.bio || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const uniqueRuns = new Set(scoped.map((item) => item.runId)).size;
  return (
    <Frame
      kicker="Actual browser audit history"
      heading="Observer."
      description="Review what the browser actually recorded on your selected public profile. These snapshots are evidence of observed page content, not verified professional achievements or owner-written memory."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Observations</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {scoped.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Distinct audit runs</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{uniqueRuns}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Latest observation</p>
          <p className="mt-2 text-sm font-semibold">
            {scoped[0]
              ? new Date(scoped[0].timestamp).toLocaleDateString()
              : 'Not yet observed'}
          </p>
        </div>
      </div>
      <section
        data-testid="identity-observation-timeline"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Activity className="size-4 text-teal-700" />
              Observation timeline
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Newest persisted audit first · {platform.toUpperCase()} @{handle}
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Filter className="absolute top-3 left-3 size-4 text-slate-400" />
            <label className="sr-only" htmlFor="observationSearch">
              Filter observations
            </label>
            <input
              id="observationSearch"
              className={input + ' pl-9'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter observations"
            />
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-5 py-12 text-center">
            <Activity className="mx-auto size-7 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              No observations found
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Run a scoped profile audit in Workspace or adjust your filter.
            </p>
          </div>
        ) : (
          <ol className="relative ml-2 space-y-4 border-l border-teal-200 pl-6">
            {matches.slice(0, 100).map((item, i) => (
              <li
                key={`${item.runId}-${item.timestamp}-${i}`}
                className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-4 before:absolute before:top-5 before:-left-[29px] before:size-2 before:rounded-full before:bg-teal-600"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm font-bold text-slate-900">
                    {item.title || 'Page observed'}
                  </p>
                  <time
                    dateTime={item.timestamp}
                    className="text-[11px] text-slate-500"
                  >
                    {new Date(item.timestamp).toLocaleString()}
                  </time>
                </div>
                {item.headline && (
                  <div className="mt-3 rounded-lg bg-white p-3">
                    <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Observed headline
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-800">
                      {item.headline}
                    </p>
                  </div>
                )}
                {item.bio && (
                  <div className="mt-2 rounded-lg bg-white p-3">
                    <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Observed bio
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-800">
                      {item.bio}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span className="font-mono">
                    Run {item.runId.slice(0, 8)}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-teal-800 hover:underline"
                  >
                    View audited page <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
        Read-only DOM observations from saved audit journals. Observer does not
        write memory notes or edit a public profile.
      </p>
    </Frame>
  );
}
