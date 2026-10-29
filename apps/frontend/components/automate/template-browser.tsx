'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  templateCatalog,
  templateCategories,
  type CatalogTemplate,
  type TemplateCategory,
  type TemplatePlatform,
} from './template-catalog';
import { growthCapabilities } from './linkedin-growth-capabilities';
import type { WorkflowPlan } from './workflow-plan-editor';
import TemplateGraphPreview from './template-graph-preview';
export type GrowthTemplateSummary = {
  id: string;
  title: string;
  objective: string;
  platform: 'linkedin';
  pipelineCount: number;
  coverageCount: number;
  executable: boolean;
};
type GrowthOption = CatalogTemplate & {
  growthId?: string;
  methodCraftId?: string;
};
type MethodCraft = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  scope: 'default' | 'personal';
};
type Props = {
  activePlatform: 'linkedin' | 'x';
  templates: WorkflowPlan[];
  onApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onApplied: () => void;
  connected: boolean;
  onGrowthApply?: (templateId: string) => Promise<void>;
};
export default function TemplateBrowser({
  activePlatform,
  templates,
  onApply,
  onApplied,
  connected,
  onGrowthApply,
}: Props) {
  const [growthTemplates, setGrowthTemplates] = useState<
    GrowthTemplateSummary[]
  >([]);
  const [growthError, setGrowthError] = useState('');
  const [toolkits, setToolkits] = useState<MethodCraft[]>([]);
  const [toolkitError, setToolkitError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/growth/templates', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error('Growth catalogue unavailable');
        return response.json() as Promise<GrowthTemplateSummary[]>;
      })
      .then((value) => {
        if (!controller.signal.aborted) setGrowthTemplates(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setGrowthError(
            error instanceof Error
              ? error.message
              : 'Growth catalogue unavailable'
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/crafts', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Error('Growth methodology catalogue unavailable');
        return response.json() as Promise<MethodCraft[]>;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          if (!Array.isArray(value))
            throw Error('Invalid Growth methodology catalogue');
          setToolkits(
            value.filter(
              (item) =>
                item.scope === 'default' && !item.slug.startsWith('growth-')
            )
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setToolkitError(
            error instanceof Error
              ? error.message
              : 'Growth methodology unavailable'
          );
      });
    return () => controller.abort();
  }, []);
  const [platform, setPlatform] = useState<TemplatePlatform>(activePlatform);
  useEffect(() => {
    setPlatform(activePlatform);
    setPicked(null);
  }, [activePlatform]);
  const [category, setCategory] = useState<TemplateCategory | 'All'>('All');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const growthSupported = typeof onGrowthApply === 'function';
  const allOptions = useMemo<GrowthOption[]>(
    () => [
      ...templateCatalog,
      ...(growthSupported
        ? growthCapabilities.map((cap) => {
            const id = 'linkedin-' + cap.id;
            const available = growthTemplates.find(
              (template) => template.id === id && template.executable
            );
            return {
              id: 'growth-' + id,
              growthId: id,
              platform: 'linkedin' as const,
              category: 'Profile' as const,
              title: cap.title,
              description: available?.objective ?? cap.summary,
              capabilities: available
                ? [
                    available.pipelineCount + ' reviewed Runner pipelines',
                    available.coverageCount + ' owner-evidence targets',
                    'No unsupported provider edits or growth-outcome claims',
                  ]
                : [...cap.actions],
              automation: available
                ? ('supported' as const)
                : ('planned' as const),
              schedule: 'manual' as const,
            };
          })
        : []),
      ...(growthSupported
        ? growthTemplates
            .filter(
              (template) =>
                !growthCapabilities.some(
                  (cap) => 'linkedin-' + cap.id === template.id
                )
            )
            .map((template) => ({
              id: 'growth-' + template.id,
              growthId: template.id,
              platform: 'linkedin' as const,
              category: 'Profile' as const,
              title: template.title,
              description: template.objective,
              capabilities: [
                template.pipelineCount + ' pipelines',
                template.coverageCount + ' coverage requirements',
              ],
              automation: template.executable
                ? ('supported' as const)
                : ('planned' as const),
              schedule: 'manual' as const,
            }))
        : []),
      ...(growthSupported
        ? toolkits.map((item) => ({
            id: 'method-' + item.slug,
            methodCraftId: item.id,
            platform: 'linkedin' as const,
            category: (item.category === 'content'
              ? 'Publishing'
              : item.category === 'engagement'
                ? 'Engagement'
                : 'Profile') as TemplateCategory,
            title: item.name,
            description: item.description,
            capabilities: [
              'Existing MDX methodology',
              'Review in the Growth library',
              'Not an executable YAML pipeline',
            ],
            automation: 'planned' as const,
            schedule: 'manual' as const,
          }))
        : []),
    ],
    [growthTemplates, toolkits, growthSupported]
  );
  const options = useMemo(
    () =>
      allOptions.filter(
        (item) =>
          item.platform === platform &&
          (category === 'All' || item.category === category) &&
          (
            item.title +
            ' ' +
            item.description +
            ' ' +
            item.capabilities.join(' ')
          )
            .toLowerCase()
            .includes(query.toLowerCase().trim())
      ),
    [platform, category, query, allOptions]
  );
  const selected = options.find((item) => item.id === picked) ?? options[0];
  const selectedPlan = selected?.action
    ? templates.find(
        (plan) => plan.platform === platform && plan.action === selected.action
      )
    : undefined;
  const selectedGrowth = selected?.growthId
    ? growthTemplates.find((template) => template.id === selected.growthId)
    : undefined;
  const count = allOptions.filter((item) => item.platform === platform).length;
  const executable = Boolean(
    selected?.automation === 'supported' &&
    (selected.growthId ||
      (selected.action &&
        templates.some(
          (plan) =>
            plan.platform === platform && plan.action === selected.action
        )))
  );
  // Loading a validated template is local authoring, never a LinkedIn action.
  // Account verification is checked again when the operator starts a run.
  const loadable =
    executable && platform === 'linkedin' && activePlatform === 'linkedin';
  async function applyTemplate() {
    if (!selected || !loadable) return;
    if (!selected.action && !selected.growthId) return;
    setApplying(true);
    setError('');
    if (selected.growthId) {
      try {
        await onGrowthApply?.(selected.growthId);
        // Callback fires after the template-load event, never during render.
        // react-doctor-disable-next-line react-doctor/no-prop-callback-in-render
        onApplied();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not load Growth workflow'
        );
      } finally {
        setApplying(false);
      }
      return;
    }
    const plan = templates.find(
      (t) => t.platform === platform && t.action === selected.action
    );
    if (!plan) {
      setError('This template has no registered executable definition.');
      setApplying(false);
      return;
    }
    const configured = selected.id.endsWith('-quit')
      ? (() => {
          const steps = [...plan.steps],
            index = steps.findIndex((step) => step.id === 'action');
          steps.splice(index, 0, {
            id: 'step-quit',
            kind: 'stop',
            title: 'Quit safely',
            message: 'Operator stopped workflow before browser action',
          });
          return {
            ...plan,
            name: selected.title,
            steps,
            links: steps
              .slice(1)
              .map((step, i) => ({ source: steps[i]!.id, target: step.id })),
          };
        })()
      : { ...plan, name: selected.title };
    try {
      await onApply(configured, selected.id);
      // Callback fires after the template-load event, never during render.
      // react-doctor-disable-next-line react-doctor/no-prop-callback-in-render
      onApplied();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save selected template'
      );
    } finally {
      setApplying(false);
    }
  }
  const platforms: ReadonlyArray<{ id: TemplatePlatform; name: string }> = [
    { id: 'linkedin', name: 'LinkedIn' },
    { id: 'x', name: 'X / Twitter' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'github', name: 'GitHub' },
    { id: 'devto', name: 'Dev.to' },
  ];
  return (
    <div
      data-testid="social-template-browser"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="mb-3 grid shrink-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-teal-700 uppercase">
            Social presence library
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Explore workflow steps and review requirements. You can load a
            supported template before connecting your account.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
          <Layers3 className="size-3.5" />
          {count} templates
        </span>
      </div>
      <div
        className="mb-3 flex shrink-0 flex-wrap gap-2"
        role="group"
        aria-label="Template platform"
      >
        {platforms.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => {
              setPlatform(p.id);
              setPicked(null);
              setError('');
            }}
            aria-pressed={platform === p.id}
            className={
              'min-h-11 rounded-xl border px-4 text-xs font-bold transition ' +
              (platform === p.id
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400')
            }
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[210px] flex-1">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" />
          <input
            aria-label="Search workflow templates"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="Search optimization, posts, reels…"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-10 text-sm outline-teal-700"
          />
        </div>
        <select
          aria-label="Filter template category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as TemplateCategory | 'All');
            setPicked(null);
          }}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
        >
          <option>All</option>
          {templateCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:grid-rows-1">
        <div
          className="min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1"
          role="listbox"
          aria-label="Workflow template list"
        >
          {options.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              No templates match this search.
            </div>
          ) : (
            options.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected?.id === item.id}
                onClick={() => {
                  setPicked(item.id);
                  setError('');
                }}
                className={
                  'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition focus-visible:outline-2 focus-visible:outline-teal-700 ' +
                  (selected?.id === item.id
                    ? 'border-teal-500 bg-teal-50/80'
                    : 'border-slate-200 bg-white hover:bg-slate-50')
                }
              >
                <span
                  className={
                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ' +
                    (item.automation === 'supported'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500')
                  }
                >
                  {item.category === 'Planning' ? (
                    <CalendarClock className="size-4" />
                  ) : item.category === 'Publishing' ? (
                    <Sparkles className="size-4" />
                  ) : (
                    <Workflow className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold text-slate-900">
                    {item.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-slate-600">
                    {item.description}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span
                      className={
                        item.automation === 'supported'
                          ? 'text-emerald-800'
                          : 'text-amber-800'
                      }
                    >
                      {item.methodCraftId
                        ? 'MDX guidance only'
                        : item.automation === 'supported' &&
                            item.platform === 'linkedin'
                          ? 'Ready to load'
                          : 'Coming soon'}
                    </span>
                    <span className="text-slate-400">{item.category}</span>
                  </span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" />
              </button>
            ))
          )}
        </div>
        <div
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4"
          data-testid="template-preview"
        >
          {selected ? (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-teal-700 uppercase">
                  <ShieldCheck className="size-4" />
                  Template details
                </div>
                <h3 className="text-lg leading-tight font-extrabold text-slate-950">
                  {selected.title}
                </h3>
                {selected?.methodCraftId && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
                    <p className="font-bold">
                      MDX methodology · not an executable YAML workflow
                    </p>
                    <p>
                      This existing Growth toolkit remains available for review
                      and cloning in the Growth library. It cannot start a
                      Runner pipeline until a validated YAML definition and
                      supported actions exist.
                    </p>
                  </div>
                )}
                {selectedGrowth && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-6 text-teal-950">
                    <p className="font-bold">
                      YAML Growth workflow · {selectedGrowth.pipelineCount}{' '}
                      connected pipelines
                    </p>
                    <p>
                      {selectedGrowth.coverageCount} separate coverage
                      requirements · Load to inspect pipeline task nodes in the
                      artboard.
                    </p>
                  </div>
                )}
                {selectedPlan ? (
                  <section
                    className="space-y-2"
                    aria-label="Visual workflow preview"
                  >
                    <p className="text-[11px] font-extrabold text-slate-900">
                      Pipeline preview · {selectedPlan.steps.length} connected
                      stages
                    </p>
                    <TemplateGraphPreview
                      key={selected.id}
                      plan={selectedPlan}
                    />
                    <p className="text-[11px] leading-4 text-slate-500">
                      This shows your actual pipeline layout. Zoom or drag
                      inside the preview to inspect it. Loading adds an editable
                      copy to the dashboard.
                    </p>
                  </section>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs leading-5 text-slate-600">
                    A visual pipeline preview will be available when this
                    integration is supported.
                  </div>
                )}
                <p className="mt-3 text-xs leading-6 text-slate-600">
                  {selected.description}
                </p>
                <div className="mt-4 space-y-2">
                  {selected.capabilities.map((cap) => (
                    <p
                      key={cap}
                      className="flex items-center gap-2 text-xs text-slate-700"
                    >
                      <Check className="size-3.5 text-teal-700" />
                      {cap}
                    </p>
                  ))}
                </div>
                <div className="mt-5 border-t border-slate-200 pt-3 text-[11px] leading-5 text-slate-600">
                  <p className="flex items-center gap-2">
                    <Clock3 className="size-3.5" />
                    Trigger:{' '}
                    {selected.schedule === 'manual'
                      ? 'Manual start'
                      : 'Scheduling requires a durable runner'}
                  </p>
                  {selected.automation === 'planned' &&
                    !selected.methodCraftId && (
                      <p className="mt-2">
                        This template is coming soon. A verified provider
                        integration and executable handler are required.
                      </p>
                    )}
                  {loadable && !connected && (
                    <p className="mt-2">
                      You can load and edit this template now. Running it
                      requires selecting, connecting, and syncing your LinkedIn
                      account.
                    </p>
                  )}
                  {loadable && connected && (
                    <p className="mt-2">
                      This template can be loaded. Execution uses the currently
                      selected verified LinkedIn account after your review.
                    </p>
                  )}
                </div>
                {growthError && (
                  <p role="alert" className="mt-3 text-xs text-amber-800">
                    {growthError}
                  </p>
                )}
                {toolkitError && (
                  <p role="status" className="mt-3 text-xs text-amber-800">
                    {toolkitError}
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-800"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div className="shrink-0 border-t border-slate-200 pt-3">
                {selected?.methodCraftId ? (
                  <a
                    href={
                      '/dashboard/growth/' +
                      encodeURIComponent(selected.methodCraftId)
                    }
                    className="flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-bold text-white"
                  >
                    Open methodology in Growth library
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!loadable || applying}
                    onClick={() => {
                      void applyTemplate();
                    }}
                    aria-label={
                      selected?.growthId
                        ? 'Load Growth workflow'
                        : 'Load selected pipeline'
                    }
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {applying
                      ? 'Loading template…'
                      : !loadable
                        ? 'Not available yet'
                        : selected?.growthId
                          ? 'Load Growth workflow'
                          : 'Load pipeline'}
                  </button>
                )}
                <p className="mt-2 text-center text-[10px] text-slate-500">
                  {selected?.methodCraftId
                    ? 'Opens the original MDX toolkit without claiming it is an executable YAML workflow.'
                    : loadable
                      ? 'Loads an editable copy on the dashboard; it does not start a LinkedIn action.'
                      : 'Planned templates require a supported integration before they can be loaded or run.'}
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Select a workflow template to review its capabilities.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
