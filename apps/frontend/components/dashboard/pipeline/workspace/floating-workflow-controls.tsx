'use client';

import { Check, Pause, Play, Plus, Square } from 'lucide-react';
import type { ComponentType, Dispatch, SetStateAction } from 'react';
import type { WorkflowPlan } from '../../workflows/workflow-plan-editor';
import type { Run } from '../run-models';
import type { WorkflowRecord } from '../use-workflow-workspace';
import type { Platform } from '../workflow-catalog';

type Props = {
  selectedGrowthTemplateId: string | null;
  workspaceOpen: boolean;
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
  cancelRun: () => Promise<void>;
  setConnectorOpenSignal: Dispatch<SetStateAction<number>>;
  platformLabel: string;
  PlatformIcon: ComponentType<{ className: string }>;
};

export default function FloatingWorkflowControls({
  selectedGrowthTemplateId,
  workspaceOpen,
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
  cancelRun,
  setConnectorOpenSignal,
  platformLabel,
  PlatformIcon,
}: Props) {
  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-[#111e2b] p-1.5 shadow-2xl lg:flex"
      data-testid="floating-workflow-controls"
    >
      {(workspaceOpen || Boolean(active)) && !selectedGrowthTemplateId && (
        <WorkflowRunButton
          active={active}
          platform={platform}
          action={action}
          busy={busy}
          available={available}
          connectorReady={connectorReady}
          loadingWorkflow={loadingWorkflow}
          workflowPlan={workflowPlan}
          activeWorkflow={activeWorkflow}
          planDirty={planDirty}
          formDirty={formDirty}
          resumeRun={resumeRun}
          pauseRun={pauseRun}
          launchRun={launchRun}
          cancelRun={cancelRun}
        />
      )}
      <button
        type="button"
        onClick={() => setConnectorOpenSignal((value) => value + 1)}
        aria-label={`${(connectorReady ? 'Manage ' : 'Connect ') + platformLabel} account`}
        aria-haspopup="dialog"
        title={
          connectorReady
            ? `${platformLabel} connected · Manage or sync`
            : `Connect ${platformLabel} account`
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

export function WorkflowRunButton({
  appearance = 'dock',
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
  cancelRun,
}: {
  appearance?: 'dock' | 'nav';
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
  cancelRun: () => Promise<void>;
}) {
  const state = active?.state;
  const canStop =
    state === 'running' ||
    state === 'paused' ||
    state === 'approval-needed' ||
    state === 'input-needed';
  const mode =
    state === 'paused'
      ? 'resume'
      : state === 'running'
        ? 'pause'
        : canStop
          ? 'stop'
          : 'run';
  const label =
    mode === 'resume'
      ? 'Resume'
      : mode === 'pause'
        ? 'Pause'
        : mode === 'stop'
          ? 'Stop'
          : 'Run workflow';
  const ariaLabel =
    mode === 'resume'
      ? 'Resume workflow'
      : mode === 'pause'
        ? 'Pause workflow'
        : mode === 'stop'
          ? 'Stop workflow'
          : 'Start workflow';

  return (
    <span
      className={
        appearance === 'nav' ? 'relative mx-1 inline-flex shrink-0' : 'contents'
      }
    >
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={
          mode === 'run' &&
          (busy ||
            available !== 'ready' ||
            !connectorReady ||
            loadingWorkflow ||
            workflowPlan.platform !== platform ||
            workflowPlan.action !== action ||
            (Boolean(activeWorkflow) && (planDirty || formDirty)))
        }
        onClick={() => {
          if (mode === 'resume') void resumeRun();
          else if (mode === 'pause') void pauseRun();
          else if (mode === 'stop') void cancelRun();
          else void launchRun();
        }}
        className={
          appearance === 'nav'
            ? 'pointer-events-auto relative z-10 inline-flex size-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-50 ' +
              (mode === 'stop'
                ? 'bg-rose-500 hover:bg-rose-400'
                : 'bg-[#111e2b] hover:bg-slate-800')
            : 'pointer-events-auto inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 text-sm font-bold transition disabled:opacity-50 ' +
              (mode === 'stop'
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-white text-slate-950 hover:bg-teal-50')
        }
      >
        {mode === 'pause' ? (
          <Pause className={appearance === 'nav' ? 'size-6' : 'size-5'} />
        ) : mode === 'stop' ? (
          <Square className="size-4 fill-current" />
        ) : (
          <Play className={appearance === 'nav' ? 'size-6' : 'size-5'} />
        )}
        {appearance === 'dock' ? (
          label
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </button>
      {(mode === 'pause' || mode === 'resume') && (
        <button
          type="button"
          aria-label="Stop workflow"
          title="Stop workflow"
          onClick={() => {
            void cancelRun();
          }}
          className={
            appearance === 'nav'
              ? 'pointer-events-auto absolute -top-1 -right-1 z-20 inline-flex size-7 items-center justify-center rounded-full bg-rose-500 text-white ring-2 ring-white'
              : 'pointer-events-auto inline-flex size-12 items-center justify-center rounded-full bg-rose-500 text-white transition hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300'
          }
        >
          <Square className="size-4 fill-current" />
        </button>
      )}
    </span>
  );
}
