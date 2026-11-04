'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  Compass,
  Crosshair,
  FileText,
  History,
  NotebookPen,
  PenLine,
  UserRound,
} from 'lucide-react';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import type { WorkflowPlan } from '../workflows/workflow-plan-editor';
import type { DashboardPane } from './dashboard-route';
import type { Run } from './run-models';
import type { WorkflowRecord } from './use-workflow-workspace';
import type { Platform } from './workflow-catalog';
import { WorkflowRunButton } from './workspace/floating-workflow-controls';

const items = [
  { id: 'workspace', label: 'Workspace', icon: Activity },
  { id: 'history', label: 'Run history', icon: History },
  { id: 'profile', label: 'Account', icon: UserRound },
  { id: 'resumes', label: 'Résumés', icon: FileText },
  { id: 'memory', label: 'Intelligence', icon: NotebookPen },
  { id: 'research', label: 'Creator research', icon: Crosshair },
  { id: 'editorial', label: 'Editorial drafts', icon: PenLine },
  { id: 'growth', label: 'Growth', icon: Compass },
] as const satisfies ReadonlyArray<{
  id: DashboardPane;
  label: string;
  icon: ComponentType<{ className?: string }>;
}>;

type Props = {
  pane: DashboardPane;
  onNavigate: (pane: DashboardPane) => void;
  showRun: boolean;
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
  chatOpen: boolean;
};

function current(pane: DashboardPane, id: DashboardPane) {
  if (id === 'profile') return pane === 'profile' || pane === 'settings';
  return pane === id;
}

export default function DashboardBottomNav({
  pane,
  onNavigate,
  showRun,
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
  chatOpen,
}: Props) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState({ width: 0, left: 0 });
  const activeIndex = items.findIndex((item) => current(pane, item.id));
  const left = items.slice(0, items.length / 2);
  const right = items.slice(items.length / 2);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const button = buttonRefs.current[activeIndex];
      if (!container || !button) return;
      const buttonBox = button.getBoundingClientRect();
      const containerBox = container.getBoundingClientRect();
      setIndicator({
        width: buttonBox.width,
        left: buttonBox.left - containerBox.left,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeIndex]);

  function itemButton(item: (typeof items)[number], index: number) {
    const selected = current(pane, item.id);
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        ref={(element) => {
          buttonRefs.current[index] = element;
        }}
        type="button"
        aria-label={item.label}
        aria-current={selected ? 'page' : undefined}
        onClick={() => onNavigate(item.id)}
        className={
          'relative z-10 inline-flex size-11 shrink-0 flex-col items-center justify-center rounded-full text-slate-500 ' +
          (selected ? 'text-teal-800' : '')
        }
      >
        <Icon className="size-5" />
      </button>
    );
  }

  return (
    <div
      className={
        'fixed bottom-3 left-1/2 z-40 w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 lg:hidden' +
        (chatOpen ? ' hidden' : '')
      }
    >
      <div
        ref={containerRef}
        data-testid="studio-bottom-nav"
        aria-label="Studio"
        className="relative flex items-center rounded-full border border-slate-200 bg-white px-1 py-1.5 shadow-xl shadow-slate-900/15"
      >
        <motion.div
          aria-hidden="true"
          animate={indicator}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 400, damping: 32 }
          }
          className="absolute top-1.5 bottom-1.5 rounded-full bg-teal-500/15"
        />
        <div className="flex min-w-0 flex-1 items-center justify-evenly overflow-x-auto">
          {left.map((item, index) => itemButton(item, index))}
        </div>
        {showRun && (
          <WorkflowRunButton
            appearance="nav"
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
        <div className="flex min-w-0 flex-1 items-center justify-evenly overflow-x-auto">
          {right.map((item, index) => itemButton(item, index + left.length))}
        </div>
      </div>
    </div>
  );
}
