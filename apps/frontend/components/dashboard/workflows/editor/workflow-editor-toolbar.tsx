'use client';

import { Plus, Save, Settings2, Square } from 'lucide-react';
import type { WorkflowPlan } from '../workflow-types';

type Props = {
  plan: WorkflowPlan;
  growthTemplateId?: string | null;
  connected: boolean;
  accountLabel?: string;
  workflowId: string | null;
  savedWorkflows: Array<{ id: string; revision: number; plan: WorkflowPlan }>;
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  onWorkflowSelect: (id: string | null) => void;
  onOpenTemplates: () => void;
  onClearGrowth?: () => void;
  onOpenAddStep: () => void;
  onSave: () => Promise<void>;
  onSaveError: (message: string) => void;
  onOpenConfig: () => void;
  onStop: () => void;
};

export function WorkflowEditorToolbar({
  plan,
  growthTemplateId,
  connected,
  accountLabel,
  workflowId,
  savedWorkflows,
  busy,
  saving,
  dirty,
  onWorkflowSelect,
  onOpenTemplates,
  onClearGrowth,
  onOpenAddStep,
  onSave,
  onSaveError,
  onOpenConfig,
  onStop,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-5">
      <div className="max-w-xl space-y-1.5">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">
          Workflow artboard
        </h2>
        <p className="text-xs leading-5 text-slate-500">
          {growthTemplateId
            ? 'Workflow · pipelines connected as nodes. Open one for its tasks, steps, actions, and events.'
            : plan.name +
              ' · one pipeline · ' +
              plan.steps.length +
              ' Runner tasks'}
        </p>
        <p
          role="status"
          data-testid="workflow-run-readiness"
          className={
            'mt-1 text-[11px] ' +
            (connected ? 'text-teal-800' : 'text-amber-800')
          }
        >
          {plan.platform === 'linkedin'
            ? connected
              ? 'Execution target: ' +
                (accountLabel || 'Selected LinkedIn account') +
                '. The server verifies this account when you run.'
              : 'You can edit this workflow now. Connect and sync the selected LinkedIn account to run it.'
            : 'A supported, verified account connection is required to run this workflow.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!growthTemplateId && (
          <select
            aria-label="Saved workflow"
            value={workflowId ?? ''}
            disabled={busy || saving || dirty}
            onChange={(event) => onWorkflowSelect(event.target.value || null)}
            className="min-h-10 max-w-[220px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold disabled:opacity-40"
          >
            <option value="">Action default (unsaved)</option>
            {savedWorkflows
              .filter((item) => item.plan.platform === plan.platform)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.plan.name} · r{item.revision}
                </option>
              ))}
          </select>
        )}
        <button
          type="button"
          aria-label="Choose workflow template"
          disabled={busy}
          onClick={onOpenTemplates}
          className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
        >
          Templates
        </button>
        {growthTemplateId && (
          <button
            type="button"
            onClick={onClearGrowth}
            className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
          >
            Action workflows
          </button>
        )}
        {!growthTemplateId && (
          <button
            type="button"
            aria-label="Add workflow step"
            disabled={busy}
            onClick={onOpenAddStep}
            className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
          >
            <Plus className="size-4" />
            Add step
          </button>
        )}
        {!growthTemplateId && (
          <button
            type="button"
            aria-label="Save workflow"
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
            className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"
          >
            <Save className="size-4" />
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        )}
        {!growthTemplateId && (
          <button
            type="button"
            aria-label="Configure action"
            onClick={onOpenConfig}
            className="flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold"
          >
            <Settings2 className="size-4" />
            Config
          </button>
        )}
        {!growthTemplateId && (
          <button
            type="button"
            aria-label="Stop workflow"
            disabled={!busy}
            onClick={onStop}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 disabled:opacity-30"
          >
            <Square className="size-3.5" />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
