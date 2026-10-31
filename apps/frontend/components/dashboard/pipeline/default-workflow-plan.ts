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
