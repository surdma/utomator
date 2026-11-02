'use client';

import { ArrowRight } from 'lucide-react';

export default function ResearchHistoryList<
  T extends {
    id: string;
    createdAt: string;
    input: { niche: string };
  },
>({ history, setActive }: { history: T[]; setActive: (run: T) => void }) {
  if (history.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold">Saved research reports</h2>
      <div className="mt-3 space-y-2">
        {history.map((run) => (
          <button
            type="button"
            key={run.id}
            onClick={() => setActive(run)}
            className="flex min-h-11 w-full justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"
          >
            <span>
              {run.input.niche} · {new Date(run.createdAt).toLocaleString()}
            </span>
            <ArrowRight className="size-4" />
          </button>
        ))}
      </div>
    </section>
  );
}
