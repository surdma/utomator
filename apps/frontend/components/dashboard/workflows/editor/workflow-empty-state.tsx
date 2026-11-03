'use client';

import { useState } from 'react';
import {
  ArrowRight,
  FilePlus2,
  FolderOpen,
  LayoutTemplate,
  Workflow,
} from 'lucide-react';
import StudioDialog from '@/components/ui/studio-dialog';
import TemplateBrowser from '../template-browser';
import type { WorkflowPlan } from '../workflow-types';
import type { WorkflowRecord } from '../../pipeline/use-workflow-workspace';

type Props = {
  platform: WorkflowPlan['platform'];
  templates: WorkflowPlan[];
  savedWorkflows: WorkflowRecord[];
  connected: boolean;
  busy: boolean;
  error?: string;
  onNew: () => void;
  onOpenSaved: (id: string) => void;
  onApplyTemplate: (plan: WorkflowPlan, id: string) => Promise<void>;
  onApplyYaml: (id: string) => Promise<void>;
};

export default function WorkflowEmptyState({
  platform,
  templates,
  savedWorkflows,
  connected,
  busy,
  error,
  onNew,
  onOpenSaved,
  onApplyTemplate,
  onApplyYaml,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const visibleSaved = savedWorkflows.filter(
    (entry) => entry.plan.platform === platform
  );

  return (
    <section
      data-testid="workflow-artboard"
      className="flex h-full min-h-[630px] flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm lg:min-h-[calc(100dvh-8rem)]"
    >
      <div
        data-workflow-canvas
        className="relative flex min-h-[540px] flex-1 flex-col items-center justify-center gap-8 overflow-y-auto bg-[#f3f6f7] px-5 pt-24 pb-8 sm:px-8"
        style={{
          backgroundImage:
            'radial-gradient(circle, #cbd5d9 0.8px, transparent 0.8px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-2 text-xs font-medium text-slate-500 sm:inset-x-6">
          <span className="rounded-xl border border-white/90 bg-white/90 px-3 py-2 shadow-sm">
            Artboard / No workflow selected
          </span>
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-800 shadow-sm transition hover:border-teal-400 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
          >
            <LayoutTemplate className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Workflow library</span>
            <span className="sm:hidden">Templates</span>
          </button>
        </div>
        <div
          data-testid="workflow-empty-state"
          className="relative w-full max-w-xl rounded-3xl border border-white/90 bg-white/95 p-6 text-center shadow-xl ring-1 shadow-slate-900/5 ring-slate-200/60 sm:p-9"
        >
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg">
            <Workflow className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-5 text-[11px] font-bold tracking-[0.14em] text-teal-800 uppercase">
            Your workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Start with a clear canvas
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Choose a workflow from the library or build your own. The canvas
            stays empty until you choose to open or create a workflow.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
            >
              <LayoutTemplate className="size-4" aria-hidden="true" />
              Browse templates
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNew}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
            >
              <FilePlus2 className="size-4" aria-hidden="true" />
              Create new workflow
            </button>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-800"
            >
              {error}
            </p>
          )}
          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            New executable workflows begin with the four required Runner stages.
            You can add and configure steps before saving.
          </p>
        </div>
        {visibleSaved.length > 0 && (
          <div className="relative mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-700">
              <FolderOpen className="size-4" aria-hidden="true" />
              Continue a saved workflow
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {visibleSaved.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenSaved(entry.id)}
                  className="min-h-11 max-w-60 min-w-44 shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-teal-500 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
                >
                  <span className="block truncate text-xs font-semibold text-slate-900">
                    {entry.plan.name}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {entry.plan.steps.length} steps · Revision {entry.revision}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <StudioDialog
        open={libraryOpen}
        onDismiss={() => setLibraryOpen(false)}
        title="Workflow library"
        description="Explore ready-to-configure action templates and YAML workflow programmes. Opening a template never starts execution."
        size="wide"
        scrollMode="contained"
        testId="workflow-template-dialog"
      >
        <TemplateBrowser
          activePlatform={platform}
          templates={templates}
          connected={connected}
          onApply={onApplyTemplate}
          onGrowthApply={onApplyYaml}
          onApplied={() => setLibraryOpen(false)}
        />
      </StudioDialog>
    </section>
  );
}
