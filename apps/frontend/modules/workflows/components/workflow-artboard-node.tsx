'use client';

import { Handle, type NodeProps } from '@xyflow/react';
import {
  Check,
  Compass,
  Crosshair,
  FileSearch,
  LockKeyhole,
  MoreHorizontal,
  ScanSearch,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { StudioNode } from './workflow-artboard-graph';

const phaseIcon = {
  start: Compass,
  session: LockKeyhole,
  inspect: ScanSearch,
  annotation: Crosshair,
  action: Zap,
  approval: ShieldCheck,
  verify: FileSearch,
  finish: Check,
};

export default function StageNode({ data, selected }: NodeProps<StudioNode>) {
  const Icon = phaseIcon[data.phase];
  const stateTone =
    data.status === 'done'
      ? 'bg-emerald-100 text-emerald-700'
      : data.status === 'active'
        ? 'bg-sky-100 text-sky-700'
        : data.status === 'failed'
          ? 'bg-rose-100 text-rose-700'
          : data.status === 'blocked'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-slate-100 text-slate-500';
  return (
    <div
      data-testid={`workflow-node-${data.phase}`}
      className={
        'group w-[240px] overflow-hidden rounded-[18px] border bg-white shadow-[0_16px_50px_-25px_rgba(15,23,42,.6)] transition ' +
        (selected
          ? 'border-teal-500 ring-[3px] ring-teal-500/20'
          : 'border-slate-200 hover:border-slate-400')
      }
    >
      <Handle
        type="target"
        position={data.to}
        className="!size-2.5 !border-2 !border-white !bg-teal-600"
      />
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-500">
          STEP {data.step}
        </span>
        <span
          className={
            'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ' +
            stateTone
          }
        >
          {data.status}
        </span>
      </div>
      <div className="flex gap-3 px-3 py-4">
        <span
          className={
            'flex size-10 shrink-0 items-center justify-center rounded-xl ' +
            (data.phase === 'action'
              ? 'bg-teal-900 text-white'
              : 'bg-slate-100 text-slate-700')
          }
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-slate-900">
            {data.title}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {data.caption}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className="text-[10px] text-slate-400">
          {data.phase === 'action' ? 'RUNNABLE ACTION' : 'REQUIRED STAGE'}
        </span>
        <MoreHorizontal className="size-4 text-slate-400" />
      </div>
      <Handle
        type="source"
        position={data.from}
        className="!size-2.5 !border-2 !border-white !bg-teal-600"
      />
    </div>
  );
}
