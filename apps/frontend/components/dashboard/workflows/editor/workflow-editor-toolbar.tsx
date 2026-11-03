'use client';

import type { ReactNode } from 'react';
import {
  ArrowLeft,
  LayoutTemplate,
  ListChecks,
  Plus,
  Save,
  Settings2,
} from 'lucide-react';
import type { WorkflowPlan } from '../workflow-types';

type Props = {
  plan: WorkflowPlan;
  growthTemplateId?: string | null;
  growthTitle?: string;
  onOpenGrowthDetails?: () => void;
  connected: boolean;
  accountLabel?: string;
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  onOpenTemplates: () => void;
  onClearGrowth?: () => void;
  onOpenAddStep: () => void;
  onSave: () => Promise<void>;
  onSaveError: (message: string) => void;
  onOpenConfig: () => void;
};

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-2xl border border-slate-200/90 bg-white/95 text-slate-800 shadow-lg ring-1 shadow-slate-900/5 ring-slate-200/70 backdrop-blur-md transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function WorkflowEditorToolbar({
  plan,
  growthTemplateId,
  growthTitle,
  onOpenGrowthDetails,
  connected,
  accountLabel,
  busy,
  saving,
  dirty,
  onOpenTemplates,
  onClearGrowth,
  onOpenAddStep,
  onSave,
  onSaveError,
  onOpenConfig,
}: Props) {
  const title = growthTemplateId
    ? growthTitle || 'Growth workflow'
    : plan.name || 'Untitled workflow';
  const taskLabel =
    plan.steps.length +
    (plan.steps.length === 1 ? ' Runner task' : ' Runner tasks');
  const target =
    plan.platform === 'linkedin'
      ? connected
        ? 'Runs on ' + (accountLabel || 'the selected LinkedIn account')
        : 'Connect LinkedIn before you run'
      : 'A verified account is required to run';
  const detail = growthTemplateId
    ? 'Pipelines connected as nodes'
    : 'One pipeline · ' + taskLabel + ' · ' + target;
  const detailClass = growthTemplateId
    ? 'text-slate-500'
    : plan.platform === 'linkedin' && connected
      ? 'text-teal-800'
      : 'text-amber-800';
  const saveLabel = saving
    ? 'Saving workflow'
    : dirty
      ? 'Save workflow'
      : 'Workflow saved';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
      <div className="pointer-events-auto flex max-w-xl min-w-0 items-center gap-1 rounded-2xl border border-white/80 bg-white/95 py-1 pr-1 pl-3 shadow-lg ring-1 shadow-slate-900/5 ring-slate-200/80 backdrop-blur-md">
        <h2
          className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-950"
          title={title + ' · ' + detail}
          data-testid="workflow-run-readiness"
        >
          {title}
          <span className={'font-normal ' + detailClass}>{' · ' + detail}</span>
        </h2>
        {!growthTemplateId && (
          <button
            type="button"
            aria-label="Configure workflow"
            title="Workflow configuration"
            onClick={onOpenConfig}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Settings2 className="size-4" />
          </button>
        )}
      </div>
      <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
        <RailButton
          label="Choose workflow template"
          disabled={busy}
          onClick={onOpenTemplates}
        >
          <LayoutTemplate className="size-4" />
        </RailButton>
        {growthTemplateId ? (
          <>
            <RailButton
              label="Growth execution and evidence"
              onClick={() => onOpenGrowthDetails?.()}
            >
              <ListChecks className="size-4" />
            </RailButton>
            <RailButton
              label="Action workflows"
              onClick={() => onClearGrowth?.()}
            >
              <ArrowLeft className="size-4" />
            </RailButton>
          </>
        ) : (
          <>
            <RailButton
              label="Add workflow step"
              disabled={busy}
              onClick={onOpenAddStep}
            >
              <Plus className="size-4" />
            </RailButton>
            <RailButton
              label={saveLabel}
              disabled={busy || saving || !dirty}
              onClick={() => {
                void onSave().catch((error) =>
                  onSaveError(
                    error instanceof Error
                      ? error.message
                      : 'Could not save workflow'
                  )
                );
              }}
            >
              <Save className="size-4" />
            </RailButton>
          </>
        )}
      </div>
    </div>
  );
}
