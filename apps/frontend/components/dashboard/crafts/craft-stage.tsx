'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Link2 } from 'lucide-react';
import type { Kind } from './craft-types';

const accent: Record<Kind, string> = {
  brief: 'bg-indigo-50 text-indigo-700',
  research: 'bg-sky-50 text-sky-800',
  draft: 'bg-amber-50 text-amber-800',
  review: 'bg-violet-50 text-violet-800',
  publish: 'bg-emerald-50 text-emerald-800',
  measure: 'bg-rose-50 text-rose-800',
};

export default function Stage({
  data,
  selected,
}: NodeProps<Node<{ title: string; kind: Kind; details: string }, 'craft'>>) {
  return (
    <div
      data-testid={'craft-node-' + data.details}
      className={
        'group w-[220px] overflow-hidden rounded-2xl border bg-white shadow-[0_10px_32px_-20px_rgba(15,23,42,.5)] transition ' +
        (selected
          ? 'border-teal-600 ring-2 ring-teal-500/15'
          : 'border-slate-200 hover:border-teal-300')
      }
    >
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-white !bg-teal-600"
      />
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span
          className={
            'rounded-md px-2 py-1 text-[10px] font-bold tracking-wide uppercase ' +
            accent[data.kind]
          }
        >
          {data.kind}
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          {data.details}
        </span>
      </div>
      <div className="px-3 py-4">
        <div className="text-sm font-bold text-slate-900">{data.title}</div>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          Select to edit instructions and connections
        </p>
      </div>
      <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
        <Link2 className="size-3.5" />
        Drag a handle to connect steps
      </div>
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-white !bg-teal-600"
      />
    </div>
  );
}
