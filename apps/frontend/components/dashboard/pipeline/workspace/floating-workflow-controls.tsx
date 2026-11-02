'use client';

import { type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { Check, Pause, Play, Plus } from 'lucide-react';
import type { Platform } from '../workflow-catalog';
import type { Run } from '../run-models';
import type { WorkflowPlan } from '../../workflows/workflow-plan-editor';
import type { WorkflowRecord } from '../use-workflow-workspace';

type Props = {
  selectedGrowthTemplateId: string | null;
  active: Run | null;
  platform: Platform;
  action: string;
  busy: boolean;
  available: 'checking' | 'ready' | 'offline';
  connectorReady: boolean;
  loadingWorkflow: boolean;
  workflowPlan: WorkflowPlan;
  activeWorkflow: WorkflowRecord | null;
  planDirty: boolean;
  formDirty: boolean;
  resumeRun: () => Promise<void>;
  pauseRun: () => Promise<void>;
  launchRun: () => Promise<void>;
  setConnectorOpenSignal: Dispatch<SetStateAction<number>>;
  platformLabel: string;
  PlatformIcon: ComponentType<{ className: string }>;
};

export default function FloatingWorkflowControls({
  selectedGrowthTemplateId,
  active,
  platform,
  action,
  busy,
  available,
  connectorReady,
  loadingWorkflow,
  workflowPlan,
  activeWorkflow,
  planDirty,
  formDirty,
  resumeRun,
  pauseRun,
  launchRun,
  setConnectorOpenSignal,
  platformLabel,
  PlatformIcon,
}: Props) {
  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-[#111e2b] p-1.5 shadow-2xl"
      data-testid="floating-workflow-controls"
    >
      {!selectedGrowthTemplateId && (
        <button
          type="button"
          aria-label={
            active?.state === 'paused'
              ? 'Resume workflow'
              : active?.state === 'running'
                ? 'Pause workflow'
                : 'Start workflow'
          }
          disabled={
            active?.state === 'paused'
              ? false
              : active?.state === 'running'
                ? false
                : busy ||
                  available !== 'ready' ||
                  !connectorReady ||
                  loadingWorkflow ||
                  workflowPlan.platform !== platform ||
                  workflowPlan.action !== action ||
                  (Boolean(activeWorkflow) && (planDirty || formDirty))
          }
          onClick={() => {
            if (active?.state === 'paused') void resumeRun();
            else if (active?.state === 'running') void pauseRun();
            else void launchRun();
          }}
          className="pointer-events-auto inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-6 text-sm font-bold text-slate-950 transition hover:bg-teal-50 disabled:opacity-50"
        >
          {active?.state === 'running' ? (
            <Pause className="size-5" />
          ) : (
            <Play className="size-5" />
          )}
          {active?.state === 'paused'
            ? 'Resume'
            : active?.state === 'running'
              ? 'Pause'
              : 'Run workflow'}
        </button>
      )}
      <button
        type="button"
        onClick={() => setConnectorOpenSignal((value) => value + 1)}
        aria-label={
          (connectorReady ? 'Manage ' : 'Connect ') + platformLabel + ' account'
        }
        aria-haspopup="dialog"
        title={
          connectorReady
            ? platformLabel + ' connected · Manage or sync'
            : 'Connect ' + platformLabel + ' account'
        }
        data-testid="floating-connector-button"
        className="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
      >
        <span className="grid size-5 shrink-0 place-items-center [&>svg]:h-5 [&>svg]:w-5">
          <PlatformIcon className="size-5" />
        </span>
        <span
          aria-hidden="true"
          className={
            'absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-slate-950 ring-2 ring-[#111e2b] ' +
            (connectorReady ? 'bg-emerald-400' : 'bg-amber-400')
          }
        >
          {connectorReady ? (
            <Check className="size-2.5" strokeWidth={3} />
          ) : (
            <Plus className="size-2.5" strokeWidth={3} />
          )}
        </span>
      </button>
    </div>
  );
}
