import type { Platform } from './workflow-catalog';
import type { Region, VisualAnnotation } from '../visual-review-panel';

export type State =
  | 'running'
  | 'paused'
  | 'approval-needed'
  | 'input-needed'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';
export type Event = {
  id: number;
  runId: string;
  time: string;
  kind: string;
  message: string;
  details?: {
    checkpointId?: string;
    fileName?: string;
    title?: string;
    headline?: string | null;
    bio?: string | null;
    xName?: string | null;
    url?: string;
    excerpt?: string;
    section?: string;
  };
};
export type Run = {
  id: string;
  platform: Platform;
  action: string;
  state: State;
  createdAt: string;
  error?: string;
};
export type Coverage = {
  id: string;
  label: string;
  platform: Platform;
  status: 'implemented' | 'manual' | 'reference';
  source: string;
  note: string;
};
export type Playbook = {
  source: string;
  reviewed: string;
  stages: string[];
  guardrails: string[];
  recommended: { headline: string | null; about: string | null };
  sections: string[];
  coverage: Coverage[];
  artifacts: {
    scripts: string[];
    snapshots: string[];
    screenshots: string[];
    rootSnapshots: string[];
  };
};
export type Assessment = {
  runId: string;
  comparisons: Array<{
    field: string;
    observed: string | null;
    proposed: string | null;
    status: string;
  }>;
  notice: string;
};
export type Review = {
  id: string;
  createdAt: string;
  platform: Platform;
  handle: string;
  pageUrl: string;
  nodeId: string;
  note: string;
  regions: Region[];
  annotations?: VisualAnnotation[];
  source:
    | { kind: 'capture'; runId: string; fileName: string }
    | { kind: 'upload' }
    | { kind: 'review'; reviewId: string };
};


export type Checkpoint = { kind: 'approval' | 'input'; id: string; message: string };
export type ChatMessage = { id: number; sender: 'user' | 'assistant'; text: string };
