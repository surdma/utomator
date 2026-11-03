'use client';

import Image from 'next/image';
import { type ReactNode } from 'react';
import StudioDialog from '@/components/ui/studio-dialog';
import TemplateBrowser from '../template-browser';
import type { StepKind, WorkflowPlan, RunEvent } from '../workflow-types';

type StepChoice = { kind: StepKind; name: string; help: string };

type Props = {
  configOpen: boolean;
  onConfigDismiss: () => void;
  templateOpen: boolean;
  onTemplateDismiss: () => void;
  addOpen: boolean;
  onAddDismiss: () => void;
  outputOpen: boolean;
  onOutputDismiss: () => void;
  children: ReactNode;
  editorError: string;
  onEditorError: (message: string) => void;
  saving: boolean;
  busy: boolean;
  onSave: () => Promise<void>;
  plan: WorkflowPlan;
  templates: WorkflowPlan[];
  connected: boolean;
  onGrowthTemplateApply?: (id: string) => Promise<void>;
  onTemplateApply: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  onAddStep: (kind: StepKind) => void;
  choices: StepChoice[];
  state?: string;
  runId?: string;
  events: RunEvent[];
  evidenceRoot?: string;
  onEvidenceOpen?: (runId: string, fileName: string) => void;
};

export function WorkflowEditorDialogs({
  configOpen,
  onConfigDismiss,
  templateOpen,
  onTemplateDismiss,
  addOpen,
  onAddDismiss,
  outputOpen,
  onOutputDismiss,
  children,
  editorError,
  onEditorError,
  saving,
  busy,
  onSave,
  plan,
  templates,
  connected,
  onGrowthTemplateApply,
  onTemplateApply,
  onAddStep,
  choices,
  state,
  runId,
  events,
  evidenceRoot,
  onEvidenceOpen,
}: Props) {
  const images = events.filter(
    (e) =>
      e.kind === 'screenshot' &&
      /^[a-zA-Z0-9_-]+\.png$/.test(e.details?.fileName ?? '')
  );
  const observed = [...events]
    .reverse()
    .find(
      (e) =>
        e.kind === 'audit' &&
        (e.details?.headline || e.details?.bio || e.details?.excerpt)
    );
  const result = events.filter((e) => e.kind === 'result');

  return (
    <>
      <StudioDialog
        open={configOpen}
        onDismiss={onConfigDismiss}
        title="Workflow configuration"
        description="Account, page, and fields for this workflow. Run, pause, resume, or stop it from the dock."
        size="wide"
        testId="workflow-configuration-dialog"
      >
        {children}
        {editorError && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-800"
          >
            {editorError}
          </p>
        )}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => {
              onEditorError('');
              void onSave()
                .then(() => onConfigDismiss())
                .catch((error) =>
                  onEditorError(
                    error instanceof Error
                      ? error.message
                      : 'Could not save workflow'
                  )
                );
            }}
            disabled={saving || busy}
            className="min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-40"
          >
            Save configuration
          </button>
        </div>
      </StudioDialog>
      <StudioDialog
        open={templateOpen}
        onDismiss={onTemplateDismiss}
        title="Workflow library"
        description="Browse action templates and YAML workflows. Inspect connected steps and execution limits before opening a workflow."
        size="wide"
        scrollMode="contained"
        testId="workflow-template-dialog"
      >
        <TemplateBrowser
          activePlatform={plan.platform}
          templates={templates}
          connected={connected}
          onGrowthApply={onGrowthTemplateApply}
          onApply={onTemplateApply}
          onApplied={onTemplateDismiss}
        />
      </StudioDialog>
      <StudioDialog
        open={addOpen}
        onDismiss={onAddDismiss}
        title="Add executable step"
        description="Each new node is inserted before the action. Reconnect or reorder it as needed."
        size="wide"
        testId="workflow-add-step-dialog"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((item) => (
            <button
              type="button"
              key={item.kind}
              onClick={() => onAddStep(item.kind)}
              className="rounded-xl border border-slate-200 p-3 text-left hover:border-teal-500 hover:bg-teal-50"
            >
              <span className="text-xs font-bold">{item.name}</span>
              <p className="mt-1 text-[11px] text-slate-600">{item.help}</p>
            </button>
          ))}
        </div>
      </StudioDialog>
      <StudioDialog
        open={outputOpen}
        onDismiss={onOutputDismiss}
        title="Final workflow output"
        description="Source-backed browser evidence and recorded execution events, never a fabricated profile preview."
        size="wide"
        testId="workflow-output-dialog"
      >
        <div data-testid="workflow-output" className="space-y-4">
          <p className="rounded-xl bg-slate-950 p-4 text-sm font-semibold text-white capitalize">
            {state ?? 'No run'} · {runId ?? 'No run selected'}
          </p>
          {result.length ? (
            result.map((e, i) => (
              <p
                key={i}
                className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900"
              >
                {e.message}
              </p>
            ))
          ) : (
            <p className="text-xs text-slate-500">
              No verified result event recorded.
            </p>
          )}
          {observed?.details && (
            <div
              data-testid="observed-profile-preview"
              className="rounded-xl border border-slate-200 p-4"
            >
              <p className="mb-2 text-xs font-bold">Observed page content</p>
              <p className="text-sm font-semibold">
                {observed.details.title ??
                  observed.details.xName ??
                  'Observed page'}
              </p>
              <p className="mt-2 text-xs whitespace-pre-wrap text-slate-600">
                {observed.details.headline ??
                  observed.details.bio ??
                  observed.details.excerpt ??
                  ''}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((e, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                {evidenceRoot && (
                  <button
                    type="button"
                    onClick={() => {
                      onOutputDismiss();
                      if (runId && e.details?.fileName)
                        onEvidenceOpen?.(runId, e.details.fileName);
                    }}
                    className="block w-full"
                  >
                    <Image
                      unoptimized
                      src={evidenceRoot + e.details!.fileName}
                      alt={e.message}
                      width={640}
                      height={420}
                      className="w-full object-contain"
                    />
                  </button>
                )}
                <p className="p-2 text-xs">{e.message}</p>
              </div>
            ))}
          </div>
          <h3 className="text-xs font-bold">Run event journal</h3>
          <div className="max-h-52 overflow-y-auto">
            {events.map((e, i) => (
              <p
                key={i}
                className="border-b border-slate-100 py-1 text-xs text-slate-600"
              >
                <strong className="uppercase">{e.kind} </strong>
                {e.message}
              </p>
            ))}
          </div>
        </div>
      </StudioDialog>
    </>
  );
}
