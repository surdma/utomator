'use client';

import { ArrowRight } from 'lucide-react';
import type { GrowthExecutionProjection } from '../model/growth-execution-projection';
import { request } from '../model/growth-profile-client';
import type { Program, Run } from './growth-profile-types';

type Props = {
  run: Run;
  execution: GrowthExecutionProjection | null;
  program: Program | null;
  busy: boolean;
  working: boolean;
  endpoint: string;
  mutate: (operation: () => Promise<unknown>) => Promise<void>;
};

export default function GrowthRunControls({
  run,
  execution,
  program,
  busy,
  working,
  endpoint,
  mutate,
}: Props) {
  const active = run.currentStage;
  const child = run.currentChild;
  const checkpoint = child?.checkpoint;
  const pipeline =
    execution?.runId === run.id &&
    execution?.workflowId === run.programId &&
    execution?.workflowRevision === run.programVersion &&
    execution?.sourceDigest === run.sourceDigest
      ? execution.pipelines.find((item) => item.id === active?.id)
      : undefined;
  const historyReady =
    pipeline && !pipeline.historyIncomplete && pipeline.runId === child?.id;
  const checkpointTask =
    historyReady && checkpoint
      ? pipeline.tasks.find((task) => task.checkpointId === checkpoint.id)
      : undefined;
  const pageEvidence = run.currentPageEvidence;
  const evidenceRecorded =
    historyReady &&
    pageEvidence &&
    pipeline.tasks.some(
      (task) =>
        task.id === pageEvidence.stepId &&
        task.output?.id === pageEvidence.outputId &&
        task.output?.digest === pageEvidence.outputDigest &&
        task.output?.evidenceDigest === pageEvidence.digest,
    );
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            Run {run.id.slice(0, 8)}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Current stage: {active?.title} · {pipeline?.state ?? 'unavailable'}
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-600">
          {run.counts.ownerSupplied}/{run.counts.total} owner-supplied ·{' '}
          {run.counts.missing} missing
        </span>
      </div>
      {(!pipeline || pipeline.historyIncomplete) && (
        <p role="status" className="mt-3 text-xs text-amber-800">
          Journal unavailable or incomplete. Recorded execution and checkpoints
          cannot be verified yet.
        </p>
      )}
      {evidenceRecorded && (
        <p className="mt-3 text-xs leading-5 break-words text-slate-600">
          Runner page evidence: {pageEvidence.url} · SHA-256{' '}
          {pageEvidence.digest.slice(0, 16)}…
        </p>
      )}
      {pipeline?.runId && (
        <a
          href={`/api/runs/${pipeline.runId}/workflow.yaml`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-teal-800 underline"
        >
          Inspect actual Runner YAML <ArrowRight className="size-3.5" />
        </a>
      )}
      {pipeline?.state === 'approval-needed' &&
        child &&
        checkpoint &&
        checkpointTask && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">
              Owner evidence approval required
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              {checkpoint.message}
            </p>
            <div className="mt-3 flex gap-2">
              {[true, false].map((approved) => (
                <button
                  key={String(approved)}
                  type="button"
                  disabled={working}
                  className="min-h-10 rounded-lg border border-amber-600 px-3 text-xs font-semibold text-amber-950 disabled:opacity-50"
                  onClick={() =>
                    void mutate(() =>
                      request(`/api/runs/${child.id}/decision`, 'POST', {
                        checkpointId: checkpoint.id,
                        approved,
                      }),
                    )
                  }
                >
                  {approved ? 'Approve evidence' : 'Reject'}
                </button>
              ))}
            </div>
          </div>
        )}
      {pipeline?.state === 'paused' && historyReady && child && (
        <button
          type="button"
          disabled={working}
          className="mt-3 min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() =>
            void mutate(() => request(`/api/runs/${child.id}/resume`, 'POST'))
          }
        >
          Resume reviewed Runner stage
        </button>
      )}
      {child?.error && (
        <p className="mt-3 text-xs text-rose-700" role="alert">
          {child.error}
        </p>
      )}
      {run.status === 'active' &&
        child &&
        ['running', 'paused', 'approval-needed', 'input-needed'].includes(
          child.state,
        ) && (
          <button
            type="button"
            disabled={working}
            className="mt-3 ml-2 min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-800 disabled:opacity-50"
            onClick={() =>
              void mutate(() => request(`/api/runs/${child.id}/cancel`, 'POST'))
            }
          >
            Cancel active Runner pipeline
          </button>
        )}
      {run.releasePending && pipeline?.state === 'finalizing' && (
        <p role="status" className="mt-3 text-xs text-amber-800">
          The Runner is releasing its browser session. The next pipeline becomes
          available after cleanup.
        </p>
      )}
      {run.canAdvance && historyReady && pipeline.state === 'completed' && (
        <button
          type="button"
          disabled={working || busy}
          className="mt-3 min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() =>
            void mutate(() =>
              request(`${endpoint}/runs/${run.id}/advance`, 'POST'),
            )
          }
        >
          {run.activeIndex + 1 === program?.stages.length
            ? 'Finalize evidence report'
            : 'Advance to the next dependent pipeline'}
        </button>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {run.outcomeNotice}
      </p>
    </div>
  );
}
