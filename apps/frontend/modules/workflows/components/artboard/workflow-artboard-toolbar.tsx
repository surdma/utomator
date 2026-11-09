'use client';

import {
  Check,
  ChevronDown,
  MousePointer2,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { CanvasWorkflow } from '../workflow-artboard-graph';

type Props = {
  platform: 'linkedin' | 'x';
  action: string;
  actionLabel: string;
  actions: CanvasWorkflow[];
  nodeCount: number;
  showActions: boolean;
  onToggleActions: () => void;
  onActionPick: (actionId: string) => void;
  onOpenInspector: () => void;
  inspectorOpen: boolean;
};

export function WorkflowArtboardToolbar({
  platform,
  action,
  actionLabel,
  actions,
  nodeCount,
  showActions,
  onToggleActions,
  onActionPick,
  onOpenInspector,
  inspectorOpen,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Waypoints className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
            Workflow artboard
          </h2>
          <p className="text-[11px] text-slate-500">
            {platform === 'linkedin' ? 'LinkedIn' : 'X'} · Connected execution
            trace · {nodeCount} nodes
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            aria-label="Choose runnable action"
            aria-expanded={showActions}
            onClick={onToggleActions}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold hover:bg-slate-50"
          >
            <Zap className="size-4 text-teal-700" />
            {actionLabel}
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>
          {showActions && (
            <div
              role="menu"
              aria-label="Runnable actions"
              className="absolute top-full right-0 z-40 mt-2 max-h-72 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              {actions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === action}
                  onClick={() => onActionPick(item.id)}
                  className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-xs font-semibold hover:bg-slate-50"
                >
                  {item.title}
                  {item.id === action && (
                    <Check className="size-4 text-teal-700" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenInspector}
          aria-haspopup="dialog"
          aria-expanded={inspectorOpen}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50"
        >
          <MousePointer2 className="size-4" />
          Configure workflow
        </button>
      </div>
    </div>
  );
}
