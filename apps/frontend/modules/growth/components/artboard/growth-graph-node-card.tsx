'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, ArrowUpRight, GitBranch, Settings2 } from 'lucide-react';
import { stepIconFor } from '@/modules/workflows';
import type { GrowthGraphNode } from '../growth-graph-model';

const statusStyle: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800',
  running: 'bg-sky-100 text-sky-800',
  started: 'bg-sky-100 text-sky-800',
  failed: 'bg-rose-100 text-rose-800',
  blocked: 'bg-rose-100 text-rose-800',
  paused: 'bg-amber-100 text-amber-900',
  'approval-needed': 'bg-amber-100 text-amber-900',
  'input-needed': 'bg-amber-100 text-amber-900',
  cancelled: 'bg-slate-200 text-slate-700',
  waiting: 'bg-slate-200 text-slate-600',
};

export function GrowthGraphNodeCard({
  data,
  selected,
}: NodeProps<GrowthGraphNode>) {
  const isPipeline = data.kind === 'pipeline';
  const failed = data.state === 'failed' || data.state === 'blocked';
  const Icon = isPipeline ? GitBranch : stepIconFor[data.stepKind ?? 'note'];

  return (
    <div
      data-testid={
        isPipeline
          ? `growth-pipeline-node-${data.nodeId}`
          : `growth-task-node-${data.nodeId}`
      }
      title={data.label}
      className={
        'w-[228px] overflow-hidden rounded-2xl border bg-white shadow-lg transition-[border-color,box-shadow] ' +
        (failed
          ? 'border-rose-600 ring-2 ring-rose-200'
          : selected
            ? 'border-teal-600 ring-2 ring-teal-300'
            : 'border-slate-200 hover:border-teal-400')
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-white !bg-teal-700"
      />
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="font-mono text-[10px] font-bold text-slate-500">
          {isPipeline ? 'PIPELINE ' : 'STEP '}
          {String(data.index).padStart(2, '0')}
        </span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ' +
            (statusStyle[data.state] ?? 'bg-slate-200 text-slate-600')
          }
        >
          {data.state}
        </span>
      </div>
      <div className="flex min-h-20 gap-3 px-3 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs leading-5 font-extrabold text-slate-950">
            {data.label}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500 capitalize">
            {data.subtitle}
          </p>
        </div>
      </div>
      {data.failure && (
        <p className="mx-3 mb-3 line-clamp-2 text-[11px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-3" aria-hidden="true" />
          {data.failure}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[10px] font-semibold">
        <span className={data.designOnly ? 'text-amber-800' : 'text-teal-700'}>
          {data.designOnly
            ? 'PLANNED · NOT EXECUTABLE'
            : isPipeline
              ? `OPEN · ${data.stepCount} STEPS`
              : 'INSPECT · READ ONLY'}
        </span>
        {isPipeline ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
        ) : (
          <Settings2
            className="size-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-white !bg-teal-700"
      />
    </div>
  );
}
