import type { Connector } from '../connections/connector-onboarding';
import type { WorkflowPlan } from '../workflows/workflow-plan-editor';
import type { Platform, Workflow } from './workflow-catalog';

type RunnerAccount = Pick<
  Connector,
  'id' | 'status' | 'platform' | 'profileUrl'
>;

type RunPayloadOptions = {
  loadingWorkflow: boolean;
  activeWorkflow: { id: string; revision: number } | null;
  planDirty: boolean;
  formDirty: boolean;
  activeConnector: RunnerAccount | null;
  platform: Platform;
  action: string;
  workflowPlan: WorkflowPlan;
  form: Record<string, string>;
  selectedPage: string;
  fields: Workflow['fields'];
};

export function buildRunPayload({
  loadingWorkflow,
  activeWorkflow,
  planDirty,
  formDirty,
  activeConnector,
  platform,
  action,
  workflowPlan,
  form,
  selectedPage,
  fields,
}: RunPayloadOptions): Record<string, unknown> {
  if (loadingWorkflow) {
    throw Error('Selected workflow has not finished loading');
  }
  if (activeWorkflow && (planDirty || formDirty)) {
    throw Error('Save workflow changes before starting this revision');
  }
  if (
    !activeConnector ||
    activeConnector.status !== 'connected' ||
    activeConnector.platform !== platform
  ) {
    throw Error(
      'Select and verify the social account before starting a workflow'
    );
  }

  const payload: Record<string, unknown> = {
    platform,
    action,
    accountId: activeConnector.id,
    profileUrl: activeConnector.profileUrl,
  };
  if (activeWorkflow) {
    payload.workflowId = activeWorkflow.id;
    payload.workflowRevision = activeWorkflow.revision;
  } else {
    payload.workflow = { ...workflowPlan, parameters: { ...form } };
  }
  if (action === 'audit-page') payload.pageUrl = selectedPage;
  for (const field of fields) {
    const value = form[field.key]?.trim();
    if (field.required && !value) throw Error(field.label + ' is required');
    if (value) {
      payload[field.key] = field.key === 'websiteIndex' ? Number(value) : value;
    }
  }
  return payload;
}
