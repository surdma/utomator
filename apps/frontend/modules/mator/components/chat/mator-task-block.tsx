'use client';

import type { ReactNode } from 'react';
import type { Event as RunEvent } from '@/modules/pipeline';
import { Task } from '../elements/task';
import { projectRunTaskTrace } from './mator-run-task-trace';

export function TaskBlock({
  steps,
  evidence,
}: {
  steps: RunEvent[];
  evidence?: ReactNode;
}) {
  const trace = projectRunTaskTrace(steps);
  const visibleNotes = trace.notes.slice(-12);
  const journalId = steps[0]?.runId;
  return (
    <div className="w-full max-w-[min(100%,32rem)] min-w-0 space-y-2">
      {trace.steps.length > 0 && (
        <Task steps={trace.steps} running={trace.running} />
      )}
      {trace.hasConflicts && (
        <p role="alert" className="text-xs text-amber-800">
          Conflicting Runner events were excluded. Execution history may be
          incomplete.
        </p>
      )}
      {visibleNotes.length > 0 && (
        <details className="min-w-0 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            {trace.notes.length} recorded observation
            {trace.notes.length === 1 ? '' : 's'}
          </summary>
          {trace.notes.length > visibleNotes.length && (
            <p className="mt-2 text-[11px] text-slate-500">
              Showing the most recent {visibleNotes.length} observations.
            </p>
          )}
          <ol className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-600">
            {visibleNotes.map((event) => (
              <li key={event.id} className="break-words">
                <span className="font-semibold capitalize">{event.kind}</span>:{' '}
                {event.message}
              </li>
            ))}
          </ol>
          {journalId && /^[0-9a-f-]{36}$/i.test(journalId) && (
            <a
              href={`/api/runs/${encodeURIComponent(journalId)}/logs`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-teal-800 underline"
            >
              Open recorded Runner journal
            </a>
          )}
        </details>
      )}
      {evidence}
    </div>
  );
}
