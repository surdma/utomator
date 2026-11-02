'use client';

import { type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { useReducedMotion } from 'framer-motion';
import PipelineRunSetupForm from './workspace/pipeline-run-setup-form';
import FloatingWorkflowControls from './workspace/floating-workflow-controls';
import WorkflowPlanEditor, {
  type WorkflowPlan,
} from '../workflows/workflow-plan-editor';
import type { Connector } from '../connections/connector-onboarding';
import { type Platform, type Workflow } from './workflow-catalog';
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
  activeWorkflow: WorkflowRecord | null;
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
  activeWorkflow,
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
  const reduceMotion = useReducedMotion();
  return (
    <>
      {pane === 'workspace' && (
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
            configRequest={configRequest}
            onPlanChange={(next) => {
              setWorkflowPlan(next);
              setPlanDirty(true);
            }}
            onTemplateApply={applyTemplate}
            onSave={saveWorkflowPlan}
            runError={runFormError}
            evidenceRoot={
              active ? getApi('runs/' + active.id + '/evidence/') : undefined
            }
            onEvidenceOpen={annotateCapture}
          >
            <PipelineRunSetupForm
              reduceMotion={Boolean(reduceMotion)}
              runFormError={runFormError}
              action={action}
              platform={platform}
              chooseAction={chooseAction}
              scopeSection={scopeSection}
              setScopeSection={setScopeSection}
              pageOptions={pageOptions}
              selectedPage={selectedPage}
              profilePage={profilePage}
              setSelectedNode={setSelectedNode}
              selected={selected}
              form={form}
              setForm={setForm}
              platformLabel={platformLabel}
            />
          </WorkflowPlanEditor>
        </>
      )}
      {pane === 'workspace' && (
        <FloatingWorkflowControls
          selectedGrowthTemplateId={selectedGrowthTemplateId}
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
          setConnectorOpenSignal={setConnectorOpenSignal}
          platformLabel={platformLabel}
          PlatformIcon={PlatformIcon}
        />
      )}
    </>
  );
}
