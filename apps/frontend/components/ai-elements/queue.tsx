'use client';

import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  /** Shown while the send gate is in-flight. */
  active?: boolean;
  text?: string;
  className?: string;
};

/**
 * Queue indicator (read-only): a message is stamped and waiting for
 * the in-flight gate, nothing else.
 */
export function Queue({ active, text = 'Sending…', className }: Props) {
  if (!active) return null;
  return (
    <div
      role="status"
      data-testid="mator-queue"
      className={cn(
        'flex items-center gap-2 px-4 pt-2 text-[11px] font-medium text-slate-500',
        className
      )}
    >
      <LoaderCircle
        className="size-3 animate-spin text-teal-700"
        aria-hidden="true"
      />
      {text}
    </div>
  );
}
