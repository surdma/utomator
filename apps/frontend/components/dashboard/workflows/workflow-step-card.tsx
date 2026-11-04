'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Settings2 } from 'lucide-react';
import { stepIconFor } from './workflow-step-icons';
import { fixed } from './workflow-step-policy';
import type { FlowNode } from './workflow-types';

export default function StepCard({ data, selected }: NodeProps<FlowNode>) {
  const step = data.step,
    Icon = stepIconFor[step.kind],
    status = data.status;
  return (
    <div
      data-testid={`workflow-node-${step.id}`}
      className={
        'w-[228px] overflow-hidden rounded-2xl border bg-white shadow-lg ' +
        (status === 'failed'
          ? 'border-rose-600 ring-2 shadow-rose-200 ring-rose-300'
          : selected
            ? 'border-teal-600 ring-2 ring-teal-300'
            : 'border-slate-200')
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-white !bg-teal-700"
      />
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="font-mono text-[10px] font-bold text-slate-500">
          STEP {String(data.index).padStart(2, '0')}
        </span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
            (status === 'completed'
              ? 'bg-emerald-100 text-emerald-800'
              : status === 'started'
                ? 'bg-sky-100 text-sky-800'
                : status === 'failed'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-200 text-slate-600')
          }
        >
          {status}
        </span>
      </div>
      <div className="flex gap-3 px-3 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold">{step.title}</p>
          <p className="mt-1 text-[11px] text-slate-500 capitalize">
            {step.kind.replaceAll('-', ' ')} step
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[10px]">
        <span
          className={fixed.has(step.kind) ? 'text-slate-500' : 'text-teal-700'}
        >
          {fixed.has(step.kind)
            ? 'REQUIRED · PROTECTED'
            : 'EDITABLE · CONNECTABLE'}
        </span>
        <Settings2 className="size-3.5 text-slate-400" />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-white !bg-teal-700"
      />
    </div>
  );
}
