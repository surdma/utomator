'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronRight, FileCode2, GitBranch, Search, ShieldCheck, Workflow } from 'lucide-react';
import type { WorkflowPlan } from './workflow-plan-editor';
import { Skeleton } from '@/components/ui/skeleton';
import type { Program } from '../growth/growth-profile-types';
import {
  buildTemplateOptions,
  growthTemplateCategories,
  type GrowthTemplateCategory,
  type GrowthTemplateSummary,
} from './template-options';

export type { GrowthTemplateSummary } from './template-options';

type Props = {
  activePlatform: 'linkedin' | 'x';
  templates: WorkflowPlan[];
  onApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onApplied: () => void;
  connected: boolean;
  onGrowthApply?: (templateId: string) => Promise<void>;
};
type Readiness = 'all' | 'runner' | 'design';

const categoryLabels: Record<GrowthTemplateCategory, string> = {
  All: 'All workflows',
  research: 'Research',
  execution: 'Execution',
  measurement: 'Measurement',
  methodology: 'Methods',
};

export default function TemplateBrowser({
  activePlatform,
  onApplied,
  onGrowthApply,
}: Props) {
  const [catalog, setCatalog] = useState<GrowthTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GrowthTemplateCategory>('All');
  const [readiness, setReadiness] = useState<Readiness>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [detail, setDetail] = useState<Program | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/growth/templates', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error('The Growth YAML library is unavailable.');
        const data = (await response.json()) as GrowthTemplateSummary[];
        if (!Array.isArray(data) || data.some((item) => typeof item.id !== 'string' || typeof item.executable !== 'boolean'))
          throw Error('The Growth library returned an invalid catalogue.');
        if (!controller.signal.aborted) {
          setCatalog(data);
          setCatalogError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setCatalogError(cause instanceof Error ? cause.message : 'Unable to load Growth workflows');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  const options = useMemo(() => buildTemplateOptions(catalog), [catalog]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return options.filter((item) =>
      (category === 'All' || item.category === category) &&
      (readiness === 'all' || (readiness === 'runner' ? item.executable : !item.executable)) &&
      (!text || (item.title + ' ' + item.summary + ' ' + item.category + ' ' + item.id).toLowerCase().includes(text))
    );
  }, [options, query, category, readiness]);
  const selected = filtered.find((item) => item.id === picked) ?? filtered[0] ?? null;
  const selectedId = selected?.id ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setDetailLoading(true);
        setDetailError('');
      }
    });
    void fetch('/api/growth/templates/' + encodeURIComponent(selectedId), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error('Unable to load the selected YAML workflow.');
        const result = (await response.json()) as Program;
        if (result.id !== selectedId || !Array.isArray(result.stages) || result.stages.length === 0)
          throw Error('The selected workflow has no validated pipeline steps.');
        if (!controller.signal.aborted) {
          setDetail(result);
          setDetailError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : 'Workflow preview failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [selectedId, detailRefresh]);

  const currentDetail = detail?.id === selected?.id ? detail : null;
  async function loadSelected() {
    if (!selected || !currentDetail || !onGrowthApply || applying || activePlatform !== 'linkedin') return;
    setApplying(true);
    setApplyError('');
    try {
      await onGrowthApply(selected.id);
      onApplied();
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : 'Unable to open this Growth workflow');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div data-testid="social-template-browser" className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-teal-800 uppercase">Growth workflow library</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            One YAML source per workflow. Inspect pipelines and steps before opening them.
          </p>
        </div>
        <span data-testid="growth-template-count" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {options.length} workflows
        </span>
      </header>
      <div className="flex shrink-0 flex-wrap gap-2">
        <label className="relative min-w-0 flex-[2_1_220px]">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-500" aria-hidden="true" />
          <span className="sr-only">Search Growth workflows</span>
          <input
            type="search"
            aria-label="Search Growth workflows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find profile, content, jobs, analytics…"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-700"
          />
        </label>
        <label className="min-w-0 flex-[1_1_140px]">
          <span className="sr-only">Filter Growth category</span>
          <select
            aria-label="Filter Growth category"
            value={category}
            onChange={(event) => setCategory(event.target.value as GrowthTemplateCategory)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            {growthTemplateCategories.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-[1_1_140px]">
          <span className="sr-only">Filter workflow availability</span>
          <select
            aria-label="Filter workflow availability"
            value={readiness}
            onChange={(event) => setReadiness(event.target.value as Readiness)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            <option value="all">All states</option>
            <option value="runner">Runner supported</option>
            <option value="design">Planning only</option>
          </select>
        </label>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1">
        <div className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/60 p-2" role="region" aria-label="Growth workflow results">
          {loading ? (
            <div role="status" aria-label="Loading Growth templates" className="space-y-3 p-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="space-y-2 rounded-xl bg-white p-4">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              ))}
            </div>
          ) :
           catalogError ? (
            <div className="space-y-3 p-4">
              <p role="alert" className="text-sm text-rose-800">{catalogError}</p>
              <button type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div data-testid="growth-templates-empty" className="space-y-3 p-5 text-sm text-slate-600">
              <p>No Growth workflows match these filters.</p>
              <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 font-semibold" onClick={() => { setQuery(''); setCategory('All'); setReadiness('all'); }}>
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected?.id === item.id}
                    data-testid="growth-template-option"
                    onClick={() => { setPicked(item.id); setApplyError(''); }}
                    className={'flex min-h-20 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ' +
                      (selected?.id === item.id ? 'border-teal-500 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:border-slate-200 hover:bg-white')}
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-teal-800">
                      <Workflow className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{item.summary}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                        <span className="capitalize">{categoryLabels[item.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.pipelineCount} pipelines</span>
                        <span className="font-semibold text-teal-800">{item.executable ? 'Runner supported' : 'Planning only'}</span>
                      </span>
                    </span>
                    <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <section data-testid="template-preview" aria-label="Selected YAML workflow preview" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {!selected ? (
            <p className="p-6 text-sm text-slate-500">Choose a workflow to inspect its steps and actions.</p>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-800">{selected.priority}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 capitalize">{categoryLabels[selected.category]}</span>
                  <span className="rounded-md border border-slate-200 px-2 py-1">{selected.executable ? 'Guarded Runner' : 'Design only'}</span>
                </div>
                <h3 className="text-lg font-semibold leading-tight text-slate-950">{selected.title}</h3>
                <p className="text-xs leading-5 text-slate-600">{selected.objective}</p>
                {detailError && (
                  <div className="flex flex-wrap items-center gap-2" role="alert">
                    <p className="text-xs text-rose-700">{detailError}</p>
                    <button type="button" onClick={() => setDetailRefresh((value) => value + 1)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700">Retry preview</button>
                  </div>
                )}
                {detailLoading || (!currentDetail && !detailError) ? (
                  <div role="status" aria-label="Loading YAML pipeline preview" className="space-y-3 py-5">
                    <Skeleton className="h-6 w-1/2 rounded" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                ) : currentDetail ? (
                  <div data-testid="growth-template-pipeline-preview" className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <GitBranch className="size-4" aria-hidden="true" />
                      {currentDetail.stages.length} connected pipelines
                      <span className="ml-auto font-normal">{currentDetail.stages.reduce((total, stage) => total + stage.plan.steps.length, 0)} steps</span>
                    </div>
                    <ol className="space-y-2">
                      {currentDetail.stages.map((stage, index) => (
                        <li key={stage.id}>
                          <details open={index === 0} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-700">
                              <span className="font-mono text-teal-800">{String(index + 1).padStart(2, '0')}</span>
                              <span className="flex-1">{stage.title}</span>
                              <span className="font-normal text-slate-500">{stage.plan.steps.length} steps</span>
                              <ChevronRight className="size-4 text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true" />
                            </summary>
                            <ol className="space-y-2 border-t border-slate-200 bg-white p-3">
                              {stage.plan.steps.map((step) => (
                                <li key={step.id} className="flex items-start gap-2 text-xs leading-5">
                                  <Check className="mt-1 size-3 shrink-0 text-teal-700" aria-hidden="true" />
                                  <span><span className="mr-1 font-semibold capitalize text-slate-500">{stage.execution === 'design-only' ? step.id : step.kind}:</span>{step.title}</span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        </li>
                      ))}
                    </ol>
                    <p className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {currentDetail.limitation}
                    </p>
                    <a href={'/api/growth/templates/' + encodeURIComponent(selected.id) + '/yaml'} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-teal-800 underline underline-offset-2">
                      <FileCode2 className="size-4" aria-hidden="true" /> View source YAML
                    </a>
                  </div>
                ) : null}
                {applyError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{applyError}</p>}
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                <button
                  type="button"
                  disabled={applying || !currentDetail || !onGrowthApply || activePlatform !== 'linkedin'}
                  onClick={() => { void loadSelected(); }}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {applying ? 'Opening workflow…' : selected.executable ? 'Open YAML workflow' : 'Inspect planning workflow'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                  Opening a template never starts an external action. Planning workflows are not executable.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
