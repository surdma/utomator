'use client';

import type { ReactNode } from 'react';
import type { Event as RunEvent } from '@/components/dashboard/pipeline/run-models';
import { Task } from '../elements/task';

export function TaskBlock({
  steps,
  evidence,
}: {
  steps: RunEvent[];
  evidence?: ReactNode;
}) {
  const itemSteps = steps.map((event) => ({
    id: String(event.id),
    title: `${event.kind === 'error' ? 'Failed' : event.kind}: ${event.message}`,
    status: event.kind === 'error' ? ('error' as const) : ('done' as const),
  }));
  return (
    <div className="w-full max-w-[min(100%,32rem)] min-w-0 space-y-2">
      <Task steps={itemSteps} running={false} />
      {evidence}
    </div>
  );
}
