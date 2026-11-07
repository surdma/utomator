'use client';

import {
  Activity,
  BookOpen,
  Clock3,
  MessageSquareText,
  Search,
} from 'lucide-react';

type Entry = {
  id: string;
  time: string;
  source: 'chat' | 'browser';
  platform: 'linkedin' | 'x' | null;
  text: string;
  runId?: string;
};

export default function IntelligenceActivityFeed({
  initialView,
  selection,
  error,
  query,
  setQuery,
}: {
  initialView: 'memory' | 'observer';
  selection: Entry[];
  error: string;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <section
      data-testid={
        initialView === 'memory'
          ? 'identity-memory'
          : 'identity-observation-timeline'
      }
      className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">
            {initialView === 'memory' ? 'Conversation memory' : 'Observer.'}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            {initialView === 'memory'
              ? 'Saved automatically from new messages you send in Mator. No model is connected, so nothing is inferred or invented.'
              : 'Read-only audit observations. Each entry retains its browser-run provenance.'}
          </p>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search activity</span>
          <Search className="absolute top-3.5 left-3 size-4 text-slate-400" />
          <input
            className="min-h-11 w-full rounded-xl border border-slate-200 pr-3 pl-10 text-sm focus:outline-teal-600"
            placeholder="Search activity"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-6 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-7 flex flex-col gap-3">
        {selection.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
          >
            <p className="flex items-center gap-2 text-xs font-semibold text-teal-800">
              {item.source === 'chat' ? (
                <MessageSquareText className="size-4" />
              ) : (
                <Activity className="size-4" />
              )}
              {item.source === 'chat' ? 'Your message' : 'Browser observation'}
              {item.platform ? ` · ${item.platform.toUpperCase()}` : ''}
            </p>
            <p className="mt-3 text-sm leading-7 break-words whitespace-pre-wrap text-slate-800">
              {item.text}
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="size-3.5" />
              {new Date(item.time).toLocaleString()}
              {item.runId ? ` · Run ${item.runId.slice(0, 8)}` : ''}
            </p>
          </article>
        ))}
      </div>
      {!selection.length && !error && (
        <div className="mt-8 rounded-2xl bg-slate-50 px-6 py-12 text-center">
          <BookOpen className="mx-auto size-7 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            No matching events
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {initialView === 'memory'
              ? 'Send a message in Mator to create the first memory entry.'
              : 'Complete a read-only browser audit to populate Observer.'}
          </p>
        </div>
      )}
    </section>
  );
}
