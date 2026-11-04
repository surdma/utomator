'use client';

import { timeLabel } from '@/components/dashboard/pipeline/presentation-utils';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  runId?: string | null;
  time?: string | null;
  className?: string;
};

/** Quiet run-boundary marker in the transcript. */
export function Checkpoint({ label, runId, time, className }: Props) {
  return (
    <div
      data-slot="checkpoint"
      data-testid="task-checkpoint"
      className={cn(
        'flex items-center gap-3 py-1 text-[11px] text-slate-400 select-none',
        className,
      )}
    >
      <span className="h-px flex-1 bg-slate-200" />
      <span className="flex items-center gap-1.5 font-medium tracking-wider whitespace-nowrap uppercase">
        {label}
        {time ? ` · ${timeLabel(time)}` : ''}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
      {runId && (
        <span className="font-mono text-[10px] text-slate-300">
          {runId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
