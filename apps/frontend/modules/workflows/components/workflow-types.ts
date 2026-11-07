import type { Node } from '@xyflow/react';

export type StepKind =
  | 'start'
  | 'session'
  | 'inspect'
  | 'action'
  | 'verify'
  | 'note'
  | 'delay'
  | 'assess'
  | 'evidence'
  | 'approve'
  | 'pause'
  | 'stop'
  | 'finish';
export type WorkflowStep = {
  id: string;
  kind: StepKind;
  title: string;
  message?: string;
  delayMs?: number;
  expectedText?: string;
  inputBindings?: {
    message?: {
      stepId: string;
      field:
        | 'url'
        | 'excerpt'
        | 'status'
        | 'message'
        | 'durationMs'
        | 'matched'
        | 'summary'
        | 'digest'
        | 'approved'
        | 'evidenceDigest';
    };
    delayMs?: {
      stepId: string;
      field:
        | 'url'
        | 'excerpt'
        | 'status'
        | 'message'
        | 'durationMs'
        | 'matched'
        | 'summary'
        | 'digest'
        | 'approved'
        | 'evidenceDigest';
    };
    text?: {
      stepId: string;
      field:
        | 'url'
        | 'excerpt'
        | 'status'
        | 'message'
        | 'durationMs'
        | 'matched'
        | 'summary'
        | 'digest'
        | 'approved'
        | 'evidenceDigest';
    };
    observation?: { stepId: string; field: 'excerpt' };
    evidence?: { stepId: string; field: 'digest' };
    expectedMatch?: {
      stepId: string;
      field:
        | 'url'
        | 'excerpt'
        | 'status'
        | 'message'
        | 'durationMs'
        | 'matched'
        | 'summary'
        | 'digest'
        | 'approved'
        | 'evidenceDigest';
    };
  };
  definition?: { id: string; version: number };
  position?: { x: number; y: number };
};
export type WorkflowPlan = {
  version: 1;
  platform: 'linkedin' | 'x';
  action: string;
  name: string;
  parameters?: Record<string, string>;
  steps: WorkflowStep[];
  links: Array<{ source: string; target: string }>;
};
export type RunEvent = {
  id?: number;
  kind: string;
  message: string;
  details?: {
    stepId?: string;
    stage?: string;
    fileName?: string;
    title?: string;
    headline?: string | null;
    bio?: string | null;
    xName?: string | null;
    url?: string;
    excerpt?: string;
  };
};
type Data = Record<string, unknown> & {
  step: WorkflowStep;
  index: number;
  status: string;
};
export type FlowNode = Node<Data, 'step'>;
