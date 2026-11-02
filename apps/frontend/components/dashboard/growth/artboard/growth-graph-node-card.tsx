'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';
import type { GrowthGraphNode } from '../growth-graph-model';

const statuses = {
  failed: 'border-rose-600 bg-rose-50 ring-2 ring-rose-200',
  blocked: 'border-rose-500 bg-rose-50 ring-2 ring-rose-100',
  cancelled: 'border-slate-400 bg-slate-100',
  completed: 'border-emerald-500 bg-emerald-50',
  running: 'border-sky-500 bg-sky-50',
  paused: 'border-amber-400 bg-amber-50',
  'approval-needed': 'border-amber-500 bg-amber-50',
  'input-needed': 'border-amber-500 bg-amber-50',
} as Record<string, string>;

export function GrowthGraphNodeCard({
  data,
  selected,
}: NodeProps<GrowthGraphNode>) {
  const failed = data.state === 'failed' || data.state === 'blocked';
  return (
    <div
      data-testid={
        data.kind === 'pipeline'
          ? 'growth-pipeline-node-' + data.nodeId
          : 'growth-task-node-' + data.nodeId
      }
      className={
        'w-[245px] rounded-xl border-2 p-3 text-left shadow-sm transition ' +
        (statuses[data.state] ?? 'border-slate-200 bg-white') +
        (selected ? ' outline outline-2 outline-offset-2 outline-teal-700' : '')
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-white !bg-slate-600"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tracking-[.1em] text-slate-500 uppercase">
          {data.kind === 'pipeline' ? 'Pipeline' : 'Task'}
        </span>
        <span
          className={
            'text-[10px] font-semibold capitalize ' +
            (failed ? 'text-rose-800' : 'text-slate-600')
          }
        >
          {data.state}
        </span>
      </div>
      <p className="mt-2 text-sm leading-snug font-semibold text-slate-950">
        {data.label}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-600">
        {data.subtitle}
      </p>
      {data.failure && (
        <p className="mt-2 line-clamp-2 text-[11px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-3" />
          {data.failure}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-white !bg-slate-600"
      />
    </div>
  );
}
