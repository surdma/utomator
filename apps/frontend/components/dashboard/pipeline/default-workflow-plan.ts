import type { WorkflowPlan } from '../workflows/workflow-plan-editor';

export const defaultWorkflowPlan = (): WorkflowPlan => ({
  version: 1,
  platform: 'linkedin',
  action: 'audit',
  name: 'Profile audit',
  steps: [
    { id: 'start', kind: 'start', title: 'Start run' },
    { id: 'session', kind: 'session', title: 'Authenticated browser' },
    { id: 'inspect', kind: 'inspect', title: 'Inspect current page' },
    { id: 'action', kind: 'action', title: 'Inspect page' },
    { id: 'verify', kind: 'verify', title: 'Observe final page' },
    { id: 'finish', kind: 'finish', title: 'Final output' },
  ],
  links: [
    { source: 'start', target: 'session' },
    { source: 'session', target: 'inspect' },
    { source: 'inspect', target: 'action' },
    { source: 'action', target: 'verify' },
    { source: 'verify', target: 'finish' },
  ],
});

// An unsaved draft is created only after the user chooses "New workflow".
// The Runner requires four protected stages, so these are the minimal valid
// starting graph rather than a workflow auto-created on page load.
export const newWorkflowDraft = (
  platform: WorkflowPlan['platform']
): WorkflowPlan => {
  const steps: WorkflowPlan['steps'] = [
    { id: 'start', kind: 'start', title: 'Start workflow' },
    { id: 'session', kind: 'session', title: 'Verify account session' },
    { id: 'action', kind: 'action', title: 'Configure the approved action' },
    { id: 'finish', kind: 'finish', title: 'Review recorded output' },
  ];
  return {
    version: 1,
    platform,
    action: 'audit',
    name: 'Untitled workflow',
    steps,
    links: steps.slice(1).map((step, i) => ({
      source: steps[i]!.id,
      target: step.id,
    })),
  };
};
