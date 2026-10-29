'use client';

import { type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { Check, Crosshair, Focus, Pause, Play, Plus } from 'lucide-react';
import WorkflowPlanEditor, {
  type WorkflowPlan,
} from '../workflows/workflow-plan-editor';
import type { Connector } from '../connections/connector-onboarding';
import { workflows, type Platform, type Workflow } from './workflow-catalog';
import { getApi } from './api-client';
import type { DashboardPane } from './dashboard-route';
import type { Run, Event as RunEvent } from './run-models';
import type { WorkflowRecord } from './use-workflow-workspace';

type Props = {
  pane: DashboardPane;
  workflowPlan: WorkflowPlan;
  templatePlans: WorkflowPlan[];
  selectedGrowthTemplateId: string | null;
  connectorReady: boolean;
  activeConnector: Connector | null;
  applyGrowthTemplate: (id: string) => Promise<void>;
  setSelectedGrowthTemplateId: Dispatch<SetStateAction<string | null>>;
  chooseAction: (action: string) => void;
  platform: Platform;
  action: string;
  events: RunEvent[];
  active: Run | null;
  busy: boolean;
  planDirty: boolean;
  formDirty: boolean;
  planSaving: boolean;
  savedWorkflows: WorkflowRecord[];
  activeWorkflow: WorkflowRecord | null;
  selectSavedWorkflow: (id: string | null) => void;
  configRequest: number;
  setWorkflowPlan: Dispatch<SetStateAction<WorkflowPlan>>;
  setPlanDirty: Dispatch<SetStateAction<boolean>>;
  applyTemplate: (plan: WorkflowPlan, templateId: string) => Promise<void>;
  saveWorkflowPlan: () => Promise<void>;
  cancelRun: () => Promise<void>;
  runFormError: string;
  annotateCapture: (runId: string, fileName: string) => void;
  form: Record<string, string>;
  setForm: Dispatch<SetStateAction<Record<string, string>>>;
  selected: Workflow;
  scopeSection: string;
  setScopeSection: Dispatch<SetStateAction<string>>;
  pageOptions: string[];
  selectedPage: string;
  profilePage: string;
  setSelectedNode: Dispatch<SetStateAction<string>>;
  platformLabel: string;
  available: 'checking' | 'ready' | 'offline';
  loadingWorkflow: boolean;
  launchRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  pauseRun: () => Promise<void>;
  setConnectorOpenSignal: Dispatch<SetStateAction<number>>;
  PlatformIcon: ComponentType<{ className: string }>;
};

export default function PipelineWorkspace({
  pane,
  workflowPlan,
  templatePlans,
  selectedGrowthTemplateId,
  connectorReady,
  activeConnector,
  applyGrowthTemplate,
  setSelectedGrowthTemplateId,
  chooseAction,
  platform,
  action,
  events,
  active,
  busy,
  planDirty,
  formDirty,
  planSaving,
  savedWorkflows,
  activeWorkflow,
  selectSavedWorkflow,
  configRequest,
  setWorkflowPlan,
  setPlanDirty,
  applyTemplate,
  saveWorkflowPlan,
  cancelRun,
  runFormError,
  annotateCapture,
  form,
  setForm,
  selected,
  scopeSection,
  setScopeSection,
  pageOptions,
  selectedPage,
  profilePage,
  setSelectedNode,
  platformLabel,
  available,
  loadingWorkflow,
  launchRun,
  resumeRun,
  pauseRun,
  setConnectorOpenSignal,
  PlatformIcon,
}: Props) {
  return (
    <>
      {pane === 'pipeline' && (
        <>
          <WorkflowPlanEditor
            plan={workflowPlan}
            templates={templatePlans}
            growthTemplateId={selectedGrowthTemplateId}
            growthAccountId={connectorReady ? activeConnector?.id : undefined}
            onGrowthTemplateApply={applyGrowthTemplate}
            onClearGrowth={() => setSelectedGrowthTemplateId(null)}
            onGrowthActionSelect={chooseAction}
            connected={
              activeConnector?.platform === 'linkedin' &&
              activeConnector?.status === 'connected'
            }
            accountLabel={
              activeConnector?.platform === platform
                ? activeConnector.label
                : undefined
            }
            events={
              active?.platform === platform && active.action === action
                ? events
                : []
            }
            state={
              active?.platform === platform && active.action === action
                ? active.state
                : undefined
            }
            runId={
              active?.platform === platform && active.action === action
                ? active.id
                : undefined
            }
            busy={busy}
            dirty={planDirty || formDirty}
            saving={planSaving}
            savedWorkflows={savedWorkflows}
            workflowId={activeWorkflow?.id ?? null}
            onWorkflowSelect={selectSavedWorkflow}
            configRequest={configRequest}
            onPlanChange={(next) => {
              setWorkflowPlan(next);
              setPlanDirty(true);
            }}
            onTemplateApply={applyTemplate}
            onSave={saveWorkflowPlan}
            onStop={() => {
              void cancelRun();
            }}
            runError={runFormError}
            evidenceRoot={
              active ? getApi('runs/' + active.id + '/evidence/') : undefined
            }
            onEvidenceOpen={annotateCapture}
          >
            <form
              className="space-y-4"
              onSubmit={(event) => event.preventDefault()}
            >
              {runFormError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                >
                  {runFormError}
                </p>
              )}
              <label
                htmlFor="workflowSelect"
                className="block text-xs font-semibold"
              >
                Workflow action
                <select
                  id="workflowSelect"
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={action}
                  onChange={(event) => chooseAction(event.target.value)}
                >
                  {workflows[platform].map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <div
                data-testid="page-scope"
                className="rounded-xl border border-teal-200 bg-teal-50 p-3"
              >
                <p className="flex items-center gap-2 text-xs font-bold text-teal-900">
                  <Focus className="size-4" />
                  Isolate one page
                </p>
                <label
                  className="mt-2 block text-xs font-semibold"
                  htmlFor="pageScope"
                >
                  Page section
                </label>
                <select
                  id="pageScope"
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={scopeSection}
                  onChange={(e) => setScopeSection(e.target.value)}
                >
                  {pageOptions.map((part) => (
                    <option key={part} value={part}>
                      {part === 'profile'
                        ? 'Main profile'
                        : part[0].toUpperCase() + part.slice(1)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 font-mono text-[10px] break-all text-teal-800">
                  {selectedPage ||
                    'Select a saved social profile to set the inspection target.'}
                </p>
                <button
                  type="button"
                  disabled={!profilePage}
                  onClick={() => {
                    chooseAction('audit-page');
                    setSelectedNode('inspect');
                  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-teal-900 hover:underline"
                >
                  <Crosshair className="size-4" />
                  Inspect this page before editing
                </button>
              </div>
              {selected.fields.length > 0 && (
                <div className="grid gap-3">
                  {selected.fields.map((field) => (
                    <div key={field.key}>
                      <label
                        className="mb-1 block text-xs font-semibold"
                        htmlFor={'automation-' + field.key}
                      >
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-rose-500">*</span>
                        )}
                      </label>
                      {field.multiline ? (
                        <textarea
                          id={'automation-' + field.key}
                          className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-teal-600"
                          maxLength={field.max || 3000}
                          required={field.required}
                          value={form[field.key] || ''}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <input
                          id={'automation-' + field.key}
                          className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-teal-600"
                          maxLength={field.max || 500}
                          placeholder={field.placeholder}
                          required={field.required}
                          value={form[field.key] || ''}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              [field.key]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {platform === 'linkedin' && action === 'edit-profile' && (
                <p className="text-xs leading-5 text-slate-500">
                  Use details reviewed for this LinkedIn account. Content from
                  another identity is not auto-filled.
                </p>
              )}
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">
                Authentication is managed by the selected connection. Use the{' '}
                {platformLabel} icon in the floating toolbar to connect, verify,
                or sync an expired session.
              </p>
            </form>
          </WorkflowPlanEditor>
        </>
      )}
      {pane === 'pipeline' && (
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
              (connectorReady ? 'Manage ' : 'Connect ') +
              platformLabel +
              ' account'
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
      )}
    </>
  );
}
