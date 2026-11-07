'use client';

import { ArrowRight, Search, Target } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { Button } from '@/components/ui/automate-card';
import StudioDialog from '@/components/ui/studio-dialog';
import {
  capabilityForSlug,
  growthCapabilities,
  growthJourneys,
} from '@/modules/growth';
import { CraftCatalogCard } from './catalog/craft-catalog-card';
import { CraftCatalogHeader } from './catalog/craft-catalog-header';
import { craftCategoryTitles } from './craft-category-titles';
import type { Category, Craft } from './crafts-library';

type Props = {
  crafts: Craft[];
  filter: Category | 'all';
  onFilter: (value: Category | 'all') => void;
  search: string;
  onSearch: (value: string) => void;
  creating: boolean;
  onToggleCreate: () => void;
  newName: string;
  onNameChange: (value: string) => void;
  newCategory: Category;
  onCategoryChange: (value: Category) => void;
  newOutcome: string;
  onOutcomeChange: (value: string) => void;
  newAudience: string;
  onAudienceChange: (value: string) => void;
  busy: boolean;
  error?: string;
  onCreate: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: (id: string, slug: string) => void;
};
type Scope = 'all' | 'capabilities' | 'toolkits' | 'mine';
const scopes: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All experiences' },
  { id: 'capabilities', label: 'LinkedIn capabilities' },
  { id: 'toolkits', label: 'Growth toolkits' },
  { id: 'mine', label: 'My flows' },
];

export default function CraftCatalog(props: Props) {
  const {
    crafts,
    filter,
    onFilter,
    search,
    onSearch,
    creating,
    onToggleCreate,
    newName,
    onNameChange,
    newCategory,
    onCategoryChange,
    newOutcome,
    onOutcomeChange,
    newAudience,
    onAudienceChange,
    busy,
    error,
    onCreate,
    onImport,
    onOpen,
  } = props;
  const [scope, setScope] = useState<Scope>('all');
  const displayed = crafts.filter((craft) => {
    const capability = capabilityForSlug(craft.slug);
    return (
      scope === 'all' ||
      (scope === 'capabilities' && Boolean(capability)) ||
      (scope === 'toolkits' && craft.scope === 'default' && !capability) ||
      (scope === 'mine' && craft.scope === 'personal')
    );
  });
  const available = growthCapabilities.filter(
    (item) => item.status === 'partial',
  ).length;
  return (
    <div data-testid="crafts-catalogue" className="min-w-0 space-y-6">
      <CraftCatalogHeader
        capabilityCount={growthCapabilities.length}
        availableCount={available}
        onImport={onImport}
        onToggleCreate={onToggleCreate}
      />
      <section aria-labelledby="journey-heading">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-teal-700" />
          <h2
            id="journey-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Start with a professional outcome
          </h2>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {growthJourneys.map((journey) => {
            const entry = crafts.find(
              (craft) => craft.slug === `growth-${journey.sequence[0]}`,
            );
            return (
              <button
                key={journey.id}
                type="button"
                disabled={!entry}
                onClick={() => entry && onOpen(entry.id, entry.slug)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-500 hover:bg-teal-50/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50"
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                  {journey.title}
                  <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-1" />
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-600">
                  {journey.outcome}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="growth-library-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="growth-library-heading"
              className="text-lg font-semibold text-slate-950"
            >
              Growth library
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select an experience to inspect its details, MDX instructions and
              visual dependencies.
            </p>
          </div>
          <span
            role="status"
            aria-live="polite"
            className="text-xs font-semibold text-slate-500"
          >
            {displayed.length} results
          </span>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Growth collection filters"
        >
          {scopes.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
              className={
                'min-h-10 rounded-lg px-3 text-xs font-semibold transition ' +
                (scope === item.id
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-slate-500" />
            <span className="sr-only">Search growth library</span>
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              aria-label="Search crafts"
              placeholder="Search goals, actions, outcomes or evidence"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-10 text-sm outline-teal-600"
            />
          </label>
          <select
            aria-label="Growth category"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-teal-600"
            value={filter}
            onChange={(e) => onFilter(e.target.value as Category | 'all')}
          >
            <option value="all">All categories</option>
            {Object.entries(craftCategoryTitles).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {displayed.map((craft) => {
            const capability = capabilityForSlug(craft.slug);
            return (
              <CraftCatalogCard
                key={craft.id}
                craft={craft}
                capability={capability ?? null}
                onOpen={onOpen}
              />
            );
          })}
        </div>
        {displayed.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No matching growth experiences.
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 text-sm font-semibold text-teal-800 underline"
              onClick={() => {
                setScope('all');
                onFilter('all');
                onSearch('');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <StudioDialog
        open={creating}
        onDismiss={onToggleCreate}
        title="Create a growth flow"
        description="Define an actual objective and audience before generating an editable graph."
        testId="create-craft-dialog"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <label className="block text-sm font-semibold">
            Flow title
            <input
              required
              aria-label="New craft name"
              value={newName}
              onChange={(e) => onNameChange(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 p-3 text-sm"
              placeholder="e.g. Research-led professional newsletter"
            />
          </label>
          <label className="block text-sm font-semibold">
            What professional outcome should this achieve?
            <textarea
              required
              aria-label="Growth objective"
              value={newOutcome}
              onChange={(e) => onOutcomeChange(e.target.value)}
              className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm"
              placeholder="e.g. Generate qualified conversations with industry collaborators"
            />
          </label>
          <label className="block text-sm font-semibold">
            Intended audience
            <input
              required
              aria-label="Growth audience"
              value={newAudience}
              onChange={(e) => onAudienceChange(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 p-3 text-sm"
              placeholder="e.g. Researchers, hiring managers and R&D leaders"
            />
          </label>
          <label className="block text-sm font-semibold">
            Area
            <select
              aria-label="New craft category"
              value={newCategory}
              onChange={(e) => onCategoryChange(e.target.value as Category)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              {Object.entries(craftCategoryTitles).map(([key, title]) => (
                <option key={key} value={key}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" onClick={onToggleCreate}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                !newName.trim() ||
                !newOutcome.trim() ||
                !newAudience.trim()
              }
            >
              {busy ? 'Creating…' : 'Create growth flow'}
            </Button>
          </div>
        </form>
      </StudioDialog>
    </div>
  );
}
