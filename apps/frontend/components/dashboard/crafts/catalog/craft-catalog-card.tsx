'use client';

import { ArrowRight, GitBranch } from 'lucide-react';
import type { GrowthCapability } from '../../growth/linkedin-growth-capabilities';
import { craftCategoryTitles } from '../craft-category-titles';
import type { Craft } from '../craft-types';

type Props = {
  craft: Craft;
  capability: GrowthCapability | null;
  onOpen: (id: string, slug: string) => void;
};

export function CraftCatalogCard({ craft, capability, onOpen }: Props) {
  return (
    <button
      type="button"
      data-testid={`craft-card-${craft.slug}`}
      onClick={() => onOpen(craft.id, craft.slug)}
      className="group flex min-h-56 min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-teal-500 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
    >
      <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
        <span className="rounded-md border border-slate-200 px-2 py-1">
          {capability
            ? `${capability.priority} · ${capability.pillar}`
            : craftCategoryTitles[craft.category]}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-1">
          {capability
            ? capability.status === 'partial'
              ? 'Partially available'
              : 'Planned'
            : craft.scope === 'personal'
              ? 'My workflow'
              : 'MDX toolkit'}
        </span>
      </span>
      <h3 className="mt-4 text-base leading-6 font-semibold text-slate-950">
        {craft.name}
      </h3>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
        {capability ? capability.summary : craft.description}
      </p>
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <GitBranch className="size-4" />
          {craft.steps.length} steps ·{' '}
          {capability
            ? `${capability.actions.length} actions`
            : `${craft.links.length} links`}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-teal-800">
          Explore
          <ArrowRight className="size-4" />
        </span>
      </span>
    </button>
  );
}
