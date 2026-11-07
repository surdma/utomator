'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import StudioDialog from '@/components/ui/studio-dialog';
import { fixed } from '../workflow-step-policy';
import type {
  RunEvent,
  StepKind,
  WorkflowPlan,
  WorkflowStep,
} from '../workflow-types';

export type StepFormField = {
  key: 'message' | 'delayMs' | 'expectedText';
  label: string;
  control: 'text' | 'textarea' | 'number';
  min?: number;
  max?: number;
};
export type StepForm = {
  kind: StepKind;
  title: string;
  summary: string;
  fields: StepFormField[];
};

type StepChoice = { kind: StepKind; name: string; help: string };

type Props = {
  stepDraft: WorkflowStep | null;
  onDismiss: () => void;
  stepForms: Partial<Record<StepKind, StepForm>>;
  stepFormsError: string;
  onRetryStepForms: () => void;
  plan: WorkflowPlan;
  events: RunEvent[];
  choices: StepChoice[];
  busy: boolean;
  onStepDraftChange: Dispatch<SetStateAction<WorkflowStep | null>>;
  onMoveSelected: (direction: -1 | 1) => void;
  onRemove: () => void;
  onApply: () => void;
};

export function WorkflowStepInspector({
  stepDraft,
  onDismiss,
  stepForms,
  stepFormsError,
  onRetryStepForms,
  plan,
  events,
  choices,
  busy,
  onStepDraftChange,
  onMoveSelected,
  onRemove,
  onApply,
}: Props) {
  return (
    <StudioDialog
      open={Boolean(stepDraft)}
      onDismiss={onDismiss}
      title={
        stepDraft
          ? (stepForms[stepDraft.kind]?.title ?? 'Edit workflow step')
          : 'Edit workflow step'
      }
      description={
        stepDraft
          ? (stepForms[stepDraft.kind]?.summary ??
            'Changes to this step are saved as part of your workflow.')
          : 'Changes to this step are saved as part of your workflow.'
      }
      testId="workflow-step-dialog"
    >
      {stepDraft && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-500">
            Type: {stepDraft.kind} ·{' '}
            {fixed.has(stepDraft.kind)
              ? 'Required core stage'
              : 'Optional editable stage'}
          </p>
          <label className="block text-xs font-bold">
            Step title
            <input
              aria-label="Step title"
              value={stepDraft.title}
              maxLength={100}
              onChange={(e) =>
                onStepDraftChange({ ...stepDraft, title: e.target.value })
              }
              className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </label>
          {!fixed.has(stepDraft.id) && (
            <label className="block text-xs font-bold">
              Node behavior
              <select
                aria-label="Node behavior"
                value={stepDraft.kind}
                onChange={(e) => {
                  const kind = e.target.value as StepKind;
                  onStepDraftChange({
                    ...stepDraft,
                    kind,
                    ...(kind === 'delay'
                      ? { delayMs: stepDraft.delayMs ?? 1000 }
                      : { delayMs: undefined }),
                    ...(kind === 'note' || kind === 'stop'
                      ? { message: stepDraft.message ?? '' }
                      : { message: undefined }),
                    ...(kind === stepDraft.kind
                      ? {}
                      : {
                          inputBindings:
                            kind === 'evidence'
                              ? {
                                  observation: (() => {
                                    const prior = plan.steps
                                      .slice(
                                        0,
                                        plan.steps.findIndex(
                                          (item) => item.id === stepDraft.id,
                                        ),
                                      )
                                      .findLast(
                                        (item) =>
                                          item.kind === 'inspect' ||
                                          item.kind === 'verify',
                                      );
                                    return prior
                                      ? {
                                          stepId: prior.id,
                                          field: 'excerpt' as const,
                                        }
                                      : undefined;
                                  })(),
                                }
                              : kind === 'approve'
                                ? {
                                    evidence: (() => {
                                      const prior = plan.steps
                                        .slice(
                                          0,
                                          plan.steps.findIndex(
                                            (item) => item.id === stepDraft.id,
                                          ),
                                        )
                                        .findLast(
                                          (item) => item.kind === 'evidence',
                                        );
                                      return prior
                                        ? {
                                            stepId: prior.id,
                                            field: 'digest' as const,
                                          }
                                        : undefined;
                                    })(),
                                  }
                                : undefined,
                        }),
                  });
                }}
                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                {choices.map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {stepForms[stepDraft.kind]?.fields.map((field) => (
            <label key={field.key} className="block text-xs font-bold">
              {field.label}
              {field.control === 'textarea' ? (
                <textarea
                  aria-label={field.label}
                  rows={3}
                  maxLength={field.max}
                  value={String(stepDraft[field.key] ?? '')}
                  onChange={(e) =>
                    onStepDraftChange({
                      ...stepDraft,
                      [field.key]: e.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
              ) : (
                <input
                  aria-label={field.label}
                  type={field.control === 'number' ? 'number' : 'text'}
                  min={field.min}
                  max={field.min === undefined ? undefined : field.max}
                  maxLength={field.control !== 'number' ? field.max : undefined}
                  value={String(stepDraft[field.key] ?? '')}
                  onChange={(e) =>
                    onStepDraftChange({
                      ...stepDraft,
                      [field.key]:
                        field.control === 'number'
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              )}
            </label>
          ))}
          {stepFormsError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 text-xs text-rose-700"
            >
              <span>
                {stepFormsError} Step fields cannot be edited safely until they
                load.
              </span>
              <button
                type="button"
                className="min-h-9 rounded-lg border border-rose-300 px-3 font-semibold"
                onClick={onRetryStepForms}
              >
                Retry loading fields
              </button>
            </div>
          )}
          {stepDraft.kind === 'note' && (
            <label className="block text-xs font-bold">
              Note input from earlier step
              <select
                aria-label="Note input from earlier step"
                value={
                  stepDraft.inputBindings?.message
                    ? stepDraft.inputBindings.message.stepId +
                      ':' +
                      stepDraft.inputBindings.message.field
                    : ''
                }
                onChange={(event) => {
                  const selected = event.target.value;
                  const [stepId, field] = selected.split(':');
                  onStepDraftChange({
                    ...stepDraft,
                    inputBindings:
                      stepId && ['url', 'excerpt'].includes(field)
                        ? {
                            message: {
                              stepId,
                              field: field as 'url' | 'excerpt',
                            },
                          }
                        : undefined,
                  });
                }}
                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="">Static message above</option>
                {plan.steps
                  .slice(
                    0,
                    plan.steps.findIndex((item) => item.id === stepDraft.id),
                  )
                  .filter(
                    (item) => item.kind === 'inspect' || item.kind === 'verify',
                  )
                  .flatMap((item) => [
                    <option
                      key={`${item.id}:excerpt`}
                      value={`${item.id}:excerpt`}
                    >
                      {item.title}: observed excerpt
                    </option>,
                    <option key={`${item.id}:url`} value={`${item.id}:url`}>
                      {item.title}: observed URL
                    </option>,
                  ])}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Uses the real observation recorded earlier in this run, not an
                AI-generated message.
              </span>
            </label>
          )}
          {stepDraft.kind === 'evidence' && (
            <label className="block text-xs font-bold">
              Observed evidence source
              <select
                aria-label="Observed evidence source"
                value={stepDraft.inputBindings?.observation?.stepId ?? ''}
                onChange={(e) =>
                  onStepDraftChange({
                    ...stepDraft,
                    inputBindings: e.target.value
                      ? {
                          observation: {
                            stepId: e.target.value,
                            field: 'excerpt',
                          },
                        }
                      : undefined,
                  })
                }
                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="">Select an earlier observation</option>
                {plan.steps
                  .slice(
                    0,
                    plan.steps.findIndex((item) => item.id === stepDraft.id),
                  )
                  .filter(
                    (item) => item.kind === 'inspect' || item.kind === 'verify',
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · excerpt
                    </option>
                  ))}
              </select>
            </label>
          )}
          {stepDraft.kind === 'approve' && (
            <label className="block text-xs font-bold">
              Evidence requiring owner approval
              <select
                aria-label="Evidence requiring owner approval"
                value={stepDraft.inputBindings?.evidence?.stepId ?? ''}
                onChange={(e) =>
                  onStepDraftChange({
                    ...stepDraft,
                    inputBindings: e.target.value
                      ? {
                          evidence: {
                            stepId: e.target.value,
                            field: 'digest',
                          },
                        }
                      : undefined,
                  })
                }
                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="">Select an earlier evidence step</option>
                {plan.steps
                  .slice(
                    0,
                    plan.steps.findIndex((item) => item.id === stepDraft.id),
                  )
                  .filter((item) => item.kind === 'evidence')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · SHA-256
                    </option>
                  ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Separate approval is still required for any later provider
                write.
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onMoveSelected(-1)}
              disabled={fixed.has(stepDraft.id) || busy}
              aria-label="Move step earlier"
              className="min-h-10 rounded-lg border px-3 text-xs disabled:opacity-30"
            >
              <ArrowUp className="mr-1 inline size-4" />
              Earlier
            </button>
            <button
              type="button"
              onClick={() => onMoveSelected(1)}
              disabled={fixed.has(stepDraft.id) || busy}
              aria-label="Move step later"
              className="min-h-10 rounded-lg border px-3 text-xs disabled:opacity-30"
            >
              <ArrowDown className="mr-1 inline size-4" />
              Later
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={fixed.has(stepDraft.id) || busy}
              aria-label="Remove workflow step"
              className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs text-rose-700 disabled:opacity-30"
            >
              <Trash2 className="mr-1 inline size-4" />
              Remove
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={busy || Boolean(stepFormsError)}
              className="ml-auto min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-30"
            >
              Apply node changes
            </button>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <h3 className="mb-2 text-xs font-bold">Recorded node events</h3>
            {events
              .filter((e) => e.details?.stepId === stepDraft.id)
              .map((e, i) => (
                <p key={i} className="py-1 text-xs text-slate-600">
                  {e.message}
                </p>
              ))}
            {!events.some((e) => e.details?.stepId === stepDraft.id) && (
              <p className="text-xs text-slate-400">
                No execution events for this node yet.
              </p>
            )}
          </div>
        </div>
      )}
    </StudioDialog>
  );
}
