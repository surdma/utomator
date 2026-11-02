'use client';

import { Activity, BookOpen } from 'lucide-react';

type View = 'memory' | 'observer';

const tabs = [
  {
    id: 'memory',
    name: 'Memory',
    description: 'Exact user chat messages saved to this workspace',
  },
  {
    id: 'observer',
    name: 'Observer',
    description: 'Observed browser facts recorded during audits',
  },
] as const;

export default function IntelligenceSourceTabs({
  initialView,
  onNavigate,
}: {
  initialView: View;
  onNavigate: (path: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Intelligence sources"
      className="grid gap-3 sm:grid-cols-2"
    >
      {tabs.map((tab) => (
        <button
          role="tab"
          aria-selected={tab.id === initialView}
          key={tab.id}
          onClick={() =>
            onNavigate(
              tab.id === 'memory' ? '/dashboard/memory' : '/dashboard/observer'
            )
          }
          className={
            'rounded-2xl border p-5 text-left transition ' +
            (tab.id === initialView
              ? 'border-teal-600 bg-teal-50'
              : 'border-slate-200 bg-white hover:border-teal-300')
          }
        >
          <span className="flex items-center gap-2 font-semibold">
            {tab.id === 'memory' ? (
              <BookOpen className="size-5 text-teal-700" />
            ) : (
              <Activity className="size-5 text-teal-700" />
            )}
            {tab.name}
          </span>
          <span className="mt-2 block text-xs leading-5 text-slate-600">
            {tab.description}
          </span>
        </button>
      ))}
    </div>
  );
}
