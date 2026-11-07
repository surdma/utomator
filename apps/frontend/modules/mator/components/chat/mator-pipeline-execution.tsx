'use client';

import { useState } from 'react';
import type {
  GrowthExecutionProjection,
  GrowthTaskProjection,
} from '@/modules/growth';

type SubmitDecision = (
  runId: string,
  checkpointId: string,
  approved: boolean,
) => Promise<void>;
type SubmitInput = (
  runId: string,
  checkpointId: string,
  value: string,
) => Promise<void>;
type Props = {
  execution: GrowthExecutionProjection;
  title?: string;
  busy?: boolean;
  error?: string;
  onDecision?: SubmitDecision;
  onInput?: SubmitInput;
};

const states: Record<string, string> = {
  waiting: 'Waiting',
  running: 'Running',
  completed: 'Completed',
  finalizing: 'Verifying and cleaning up',
  'approval-needed': 'Approval required',
  'input-needed': 'Response required',
  paused: 'Paused',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  unavailable: 'Unavailable',
};

function PendingTask({
  task,
  runId,
  busy,
  onDecision,
  onInput,
}: {
  task: GrowthTaskProjection;
  runId: string | null;
  busy: boolean;
  onDecision?: SubmitDecision;
  onInput?: SubmitInput;
}) {
  const [input, setInput] = useState('');
  const [requestError, setRequestError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const live = task.checkpointId && runId;
  const submit = async (operation: () => Promise<void>) => {
    if (busy || submitting) return;
    setSubmitting(true);
    setRequestError('');
    try {
      await operation();
    } catch (reason) {
      setRequestError(
        reason instanceof Error ? reason.message : 'Runner request rejected',
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <li className="min-w-0 border-l border-slate-200 py-2 pl-3">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="mt-1 size-2 shrink-0 rounded-full bg-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium leading-5 break-words text-slate-800">
            {task.title}
          </div>
          <span className="text-[11px] text-slate-500">
            {states[task.state] ?? 'Unknown'}
          </span>
          {task.failure && (
            <p role="alert" className="mt-1 text-xs break-words text-rose-700">
              {task.failure}
            </p>
          )}
          {task.events.length > 0 && (
            <details className="mt-1 text-[11px] text-slate-500">
              <summary className="cursor-pointer">
                Recorded events ({task.events.length})
              </summary>
              <ol className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                {task.events.map((event) => (
                  <li key={event.id} className="break-words">
                    {event.time}: {event.message}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {runId && task.screenshots.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {task.screenshots.map((name) => (
                <a
                  key={name}
                  href={
                    '/api/runs/' +
                    encodeURIComponent(runId) +
                    '/evidence/' +
                    encodeURIComponent(name)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-800 underline"
                >
                  Recorded screenshot: {name}
                </a>
              ))}
            </div>
          )}
          {live && task.state === 'approval-needed' && onDecision && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || submitting}
                onClick={() =>
                  void submit(() => onDecision(runId, task.checkpointId!, true))
                }
                className="min-h-9 rounded-md border border-teal-700 px-2 text-xs font-semibold text-teal-800 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy || submitting}
                onClick={() =>
                  void submit(() =>
                    onDecision(runId, task.checkpointId!, false),
                  )
                }
                className="min-h-9 rounded-md border border-rose-300 px-2 text-xs font-semibold text-rose-800 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
          {live && task.state === 'input-needed' && onInput && (
            <form
              className="mt-2 flex min-w-0 flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (input.trim())
                  void submit(() =>
                    onInput(runId, task.checkpointId!, input.trim()),
                  );
              }}
            >
              <label
                className="w-full text-[11px] text-slate-600"
                htmlFor={'task-answer-' + task.id}
              >
                Requested input
              </label>
              <input
                id={'task-answer-' + task.id}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={300}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={busy || submitting || !input.trim()}
                className="min-h-9 rounded-md bg-slate-900 px-3 text-xs text-white disabled:opacity-50"
              >
                Submit
              </button>
            </form>
          )}
          {requestError && (
            <p role="alert" className="mt-1 text-xs text-rose-700">
              {requestError}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** Workspace execution is shown separately from persisted conversation messages. */
export function MatorPipelineExecution({
  execution,
  title,
  busy = false,
  error,
  onDecision,
  onInput,
}: Props) {
  return (
    <aside
      data-testid="mator-pipeline-execution"
      aria-label="Selected workspace execution"
      className="mx-3 my-2 min-w-0 max-w-[32rem] rounded-xl border border-slate-200 bg-slate-50/80 p-3"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold break-words text-slate-900">
          {title || execution.workflowId}
        </p>
        <p className="text-[11px] text-slate-500">
          Selected workspace execution · separate from saved conversation
          history
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
        {execution.pipelines.map((pipeline) => (
          <details
            key={pipeline.id}
            className="min-w-0 rounded-lg border border-slate-200 bg-white"
            open={
              [
                'running',
                'approval-needed',
                'input-needed',
                'blocked',
                'failed',
              ].includes(pipeline.state)
                ? true
                : undefined
            }
          >
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 font-semibold break-words text-slate-900">
                {pipeline.title}
              </span>
              <span className="text-slate-500">
                {pipeline.completed}/{pipeline.total} recorded
              </span>
              <span className="w-full text-[11px] text-slate-600">
                {states[pipeline.state] ?? 'Unknown'}
              </span>
            </summary>
            {pipeline.historyIncomplete && (
              <p role="status" className="mx-3 text-xs text-amber-800">
                Journal unavailable or incomplete. Progress may be missing.
              </p>
            )}
            <ol className="space-y-0 px-3 pb-2">
              {pipeline.tasks.map((task) => (
                <PendingTask
                  key={task.id}
                  task={task}
                  runId={pipeline.runId}
                  busy={busy}
                  onDecision={onDecision}
                  onInput={onInput}
                />
              ))}
            </ol>
          </details>
        ))}
      </div>
    </aside>
  );
}
