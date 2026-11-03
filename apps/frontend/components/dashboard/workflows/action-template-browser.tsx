'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  FilePlus2,
  LayoutTemplate,
  LockKeyhole,
  Search,
} from 'lucide-react';
import type { WorkflowPlan } from './workflow-types';
import { stepIconFor } from './workflow-step-icons';

type Props = {
  platform: WorkflowPlan['platform'];
  templates: WorkflowPlan[];
  connected: boolean;
  onApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onApplied: () => void;
  onBrowseYaml?: () => void;
};

export default function ActionTemplateBrowser({
  platform,
  templates,
  connected,
  onApply,
  onApplied,
  onBrowseYaml,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(
    () =>
      templates.filter(
        (item) =>
          item.platform === platform &&
          (
            item.name +
            ' ' +
            item.action +
            ' ' +
            item.steps.map((step) => step.title).join(' ')
          )
            .toLowerCase()
            .includes(query.toLowerCase().trim())
      ),
    [templates, platform, query]
  );
  const selected =
    options.find((item) => item.action === selectedAction) ??
    options[0] ??
    null;

  async function openSelected() {
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    try {
      await onApply(selected, selected.platform + '-' + selected.action);
      onApplied();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not create workflow from template'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="action-template-browser"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-teal-800 uppercase">
            Workflow library
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            Ready-to-configure workflows with a verified Runner plan.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {options.length} action templates
        </span>
      </header>
      <nav
        aria-label="Workflow template source"
        className="flex shrink-0 gap-2"
      >
        {onBrowseYaml && (
          <button
            type="button"
            onClick={onBrowseYaml}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:border-teal-400"
          >
            YAML programmes
          </button>
        )}
        <span
          aria-current="page"
          className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white"
        >
          Action templates
        </span>
      </nav>
      <label className="relative block shrink-0">
        <Search
          className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-500"
          aria-hidden="true"
        />
        <span className="sr-only">Search action templates</span>
        <input
          type="search"
          aria-label="Search action templates"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks, actions, or workflows…"
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-700"
        />
      </label>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1">
        <div
          role="region"
          aria-label="Action workflow templates"
          className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-2"
        >
          {options.length ? (
            <ul className="space-y-1.5">
              {options.map((plan) => (
                <li key={plan.platform + '-' + plan.action}>
                  <button
                    type="button"
                    data-testid="action-template-option"
                    aria-pressed={selected?.action === plan.action}
                    onClick={() => {
                      setSelectedAction(plan.action);
                      setError('');
                    }}
                    className={
                      'flex min-h-20 w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-teal-700 ' +
                      (selected?.action === plan.action
                        ? 'border-teal-500 bg-white shadow-sm'
                        : 'border-transparent bg-white/60 hover:border-slate-200 hover:bg-white')
                    }
                  >
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-teal-800">
                      <LayoutTemplate className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-950">
                        {plan.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {plan.steps.length} connected steps
                      </span>
                      <span className="mt-2 block text-[11px] font-semibold text-teal-800">
                        {plan.platform === 'linkedin' ? 'LinkedIn' : 'X'} ·{' '}
                        {plan.action.replaceAll('-', ' ')}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-2 size-4 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="p-4 text-sm text-slate-600">
              No action templates match this search.
            </p>
          )}
        </div>
        <section
          data-testid="action-template-preview"
          aria-label="Action template preview"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          {selected ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="text-[11px] font-semibold tracking-wide text-teal-800 uppercase">
                  Executable workflow plan
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">
                  {selected.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  These are the actual validated Runner stages. Configure an
                  account and review the parameters before starting a run.
                </p>
                <ol className="mt-4 space-y-2">
                  {selected.steps.map((step, index) => {
                    const Icon = stepIconFor[step.kind];
                    return (
                      <li
                        key={step.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-900">
                            {String(index + 1).padStart(2, '0')} · {step.title}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500 capitalize">
                            {step.kind} step
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                {!connected && (
                  <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-amber-800">
                    <LockKeyhole
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    Connect the account when you are ready to run.
                  </p>
                )}
                {error && (
                  <p role="alert" className="mt-3 text-xs text-rose-700">
                    {error}
                  </p>
                )}
              </div>
              <div className="shrink-0 border-t border-slate-200 p-3">
                <button
                  type="button"
                  onClick={() => void openSelected()}
                  disabled={saving}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:opacity-50"
                >
                  <FilePlus2 className="size-4" aria-hidden="true" />
                  {saving ? 'Creating workflow…' : 'Use this template'}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  Creates your own editable saved workflow; nothing runs
                  automatically.
                </p>
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-slate-500">
              Choose a template to see its steps.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
