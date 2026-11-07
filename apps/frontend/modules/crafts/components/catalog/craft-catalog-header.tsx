'use client';

import { ArrowUpFromLine, Plus } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { Button } from '@/components/ui/automate-card';

type Props = {
  capabilityCount: number;
  availableCount: number;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleCreate: () => void;
};

export function CraftCatalogHeader({
  capabilityCount,
  availableCount,
  onImport,
  onToggleCreate,
}: Props) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-5">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-widest text-teal-800 uppercase">
          Growth workspace
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          From professional visibility to measurable opportunities
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Discover evidence-backed LinkedIn capabilities and practical growth
          toolkits. Open any experience to review its objectives, proposed
          actions, visual flow and editable MDX source.
        </p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {capabilityCount} capability areas · 6 established toolkits ·{' '}
          {availableCount} partially supported capability areas
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowUpFromLine className="size-4" />
          Import
          <input
            className="sr-only"
            aria-label="Import craft"
            type="file"
            accept=".mdx,.skill,.zip"
            onChange={onImport}
          />
        </label>
        <Button variant="primary" onClick={onToggleCreate}>
          <Plus className="size-4" />
          New growth flow
        </Button>
      </div>
    </header>
  );
}
