'use client';

import { FileCode2, ShieldCheck } from 'lucide-react';
import { request } from '../../../lib/growth-profile-client';
import StudioDialog from '../../ui/studio-dialog';
import GrowthCoverageList from './coverage-list';
import GrowthEvidenceForm from './evidence-form';
import type { GrowthJournalEvent } from './growth-graph-model';
import type { Program, Run, Stage } from './growth-profile-types';
import GrowthRunControls from './run-controls';

type Props = {
  program: Program | null;
  run: Run | null;
  endpoint: string;
  accountId?: string;
  busy: boolean;
  working: boolean;
  error: string;
  journal: GrowthJournalEvent[];
  journalError: string;
  detailsOpen: boolean;
  onDetailsClose: () => void;
  taskOpen: boolean;
  onTaskClose: () => void;
  stage: Stage | null;
  taskId: string | null;
  selectedAction: string;
  onSelectAction?: (action: string) => void;
  setRun: (run: Run | null) => void;
  mutate: (operation: () => Promise<unknown>) => Promise<void>;
};

export default function GrowthWorkspaceDialogs({
  program,
  run,
  endpoint,
  accountId,
  busy,
  working,
  error,
  journal,
  journalError,
  detailsOpen,
  onDetailsClose,
  taskOpen,
  onTaskClose,
  stage,
  taskId,
  selectedAction,
  onSelectAction,
  setRun,
  mutate,
}: Props) {
  const designOnly = program?.kind === 'GrowthBlueprintWorkflow';
  const task = stage?.plan.steps.find((item) => item.id === taskId) ?? null;
  const taskEvent = [...journal]
    .reverse()
    .find((event) => event.details?.stepId === taskId && event.details?.stage);
  const liveStage = run?.pipelineRuns.find((item) => item.id === stage?.id);

  return (
    <>
      <StudioDialog
        open={detailsOpen}
        onDismiss={onDetailsClose}
        title={program?.title ?? 'Growth workflow'}
        description="YAML source, real Runner controls, and independently attributed evidence."
        size="wide"
        testId="growth-workspace-details"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {program?.objective ?? 'Loading the selected workflow…'}
            </p>
            {program && (
              <a
                href={`${endpoint}/yaml`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-teal-800 underline"
              >
                <FileCode2 className="size-4" /> View source YAML
              </a>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          {program && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              <ShieldCheck className="mr-2 inline size-4" />
              {designOnly
                ? 'Planning-only YAML. Tasks and procedures are owner-operated; there is no registered Runner operation for this blueprint.'
                : 'The compiled pipelines use the existing Runner. Evidence stays unverified until supplied; this template cannot edit a provider profile.'}
            </p>
          )}
          {!designOnly && !accountId && (
            <p
              role="status"
              className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600"
            >
              Connect and verify a LinkedIn account before starting this
              workflow.
            </p>
          )}
          {!designOnly &&
            accountId &&
            (run?.status !== 'active' ||
              ['failed', 'blocked', 'cancelled', 'unavailable'].includes(
                run.state,
              )) && (
              <button
                type="button"
                disabled={working || busy || !program}
                onClick={() =>
                  void mutate(async () => {
                    setRun(
                      await request<Run>(`${endpoint}/runs`, 'POST', {
                        accountId,
                      }),
                    );
                  })
                }
                className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Start Growth workflow
              </button>
            )}
          {!designOnly && run && (
            <>
              <GrowthRunControls
                run={run}
                program={program}
                busy={busy}
                working={working}
                endpoint={endpoint}
                mutate={mutate}
              />
              {run.status === 'active' && run.currentStage?.id !== 'review' && (
                <GrowthEvidenceForm
                  run={run}
                  program={program}
                  endpoint={endpoint}
                  working={working}
                  mutate={mutate}
                />
              )}
              <GrowthCoverageList run={run} program={program} />
            </>
          )}
          {program && (
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {program.requirements.length} requirements and registered
                actions
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-600">
                {program.requirements.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-slate-500">
                {program.limitation}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {program.pipelines.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={busy || designOnly || !onSelectAction}
                    onClick={() => onSelectAction?.(item.action)}
                    className={
                      'min-h-11 rounded-lg border p-3 text-left text-xs font-semibold disabled:opacity-50 ' +
                      (selectedAction === item.action
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-slate-200')
                    }
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </StudioDialog>
      <StudioDialog
        open={taskOpen && Boolean(task)}
        onDismiss={onTaskClose}
        title={task?.title ?? 'Task details'}
        description={
          stage
            ? stage.title +
              (designOnly ? ' · Planning-only task' : ' · Compiled Runner task')
            : undefined
        }
        testId="growth-task-details"
      >
        {task && (
          <div className="space-y-4 text-sm text-slate-700">
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5">
              Read-only source configuration. Editing these compiled tasks
              requires a validated, revisioned Growth YAML write API that is not
              available yet.
            </p>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 text-xs">
              <dt className="font-semibold">Task ID</dt>
              <dd className="font-mono break-all">{task.id}</dd>
              <dt className="font-semibold">Step kind</dt>
              <dd className="capitalize">{task.kind}</dd>
              <dt className="font-semibold">Recorded state</dt>
              <dd>
                {taskEvent?.details?.stage ?? 'No recorded task execution'}
              </dd>
            </dl>
            {task.message && (
              <section>
                <h3 className="text-xs font-semibold">Message</h3>
                <p className="mt-1 text-xs leading-5 whitespace-pre-wrap">
                  {task.message}
                </p>
              </section>
            )}
            {task.expectedText && (
              <section>
                <h3 className="text-xs font-semibold">Expected text</h3>
                <p className="mt-1 text-xs leading-5 whitespace-pre-wrap">
                  {task.expectedText}
                </p>
              </section>
            )}
            {task.delayMs !== undefined && (
              <p className="text-xs">Delay: {task.delayMs} ms</p>
            )}
            {task.inputBindings &&
              Object.entries(task.inputBindings).length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold">
                    Validated input bindings
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {Object.entries(task.inputBindings).map(
                      ([field, binding]) =>
                        binding ? (
                          <li
                            key={field}
                            className="rounded-lg border border-slate-200 p-2 text-xs"
                          >
                            {field}: {binding.stepId}.{binding.field}
                          </li>
                        ) : null,
                    )}
                  </ul>
                </section>
              )}
            {stage && stage.sectionIds.length > 0 && program && (
              <section>
                <h3 className="text-xs font-semibold">Coverage requirements</h3>
                <p className="mt-1 text-xs leading-5">
                  {stage.sectionIds
                    .map(
                      (id) =>
                        program.coverage.find((item) => item.id === id)
                          ?.label ?? id,
                    )
                    .join(' · ')}
                </p>
              </section>
            )}
            {taskEvent?.details?.reason && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {taskEvent.details.reason}
              </p>
            )}
            {liveStage?.error && (
              <p role="alert" className="text-xs text-rose-800">
                {liveStage.error}
              </p>
            )}
            {journalError && (
              <p role="status" className="text-xs text-amber-800">
                {journalError}
              </p>
            )}
            {liveStage?.childRunId && (
              <a
                href={`/api/runs/${liveStage.childRunId}/logs`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs font-semibold text-teal-800 underline"
              >
                Inspect Runner journal
              </a>
            )}
            <a
              href={`${endpoint}/yaml`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-teal-800 underline"
            >
              View complete source YAML
            </a>
          </div>
        )}
      </StudioDialog>
    </>
  );
}
