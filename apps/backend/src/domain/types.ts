import type { WorkflowPlan } from './workflow-plan.js';
export type Platform = 'linkedin' | 'x';
export interface LoginCredentials {
  identifier: string;
  password: string;
}
export type Action =
  | 'audit'
  | 'audit-page'
  | 'edit-profile'
  | 'add-skill'
  | 'compose-post'
  | 'pin-post'
  | 'delete-post'
  | 'edit-experience'
  | 'edit-website'
  | 'edit-services'
  | 'add-project'
  | 'add-featured'
  | 'upload-banner';
export type RunState =
  | 'running'
  | 'paused'
  | 'input-needed'
  | 'approval-needed'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';
export interface GrowthRunIdentity {
  parentRunId: string;
  programId: string;
  programVersion: number;
  sourceDigest: string;
  stageId: string;
  attempt: number;
  planDigest: string;
}
export interface RunRequest {
  platform: Platform;
  accountId?: string;
  action: Action;
  workflow?: WorkflowPlan;
  workflowId?: string;
  workflowRevision?: number;
  profileUrl: string;
  pageUrl?: string;
  login?: LoginCredentials;
  ownerId?: string;
  conversationId?: string;
  growth?: GrowthRunIdentity;
  headline?: string;
  about?: string;
  skill?: string;
  bio?: string;
  location?: string;
  website?: string;
  postText?: string;
  postUrl?: string;
  positionId?: string;
  description?: string;
  startMonth?: string;
  startYear?: string;
  websiteIndex?: number;
  websiteType?: string;
  projectName?: string;
  projectUrl?: string;
  featuredTitle?: string;
  bannerPath?: string;
}
export interface StreamEvent {
  id: number;
  runId: string;
  time: string;
  kind: 'status' | 'step' | 'audit' | 'approval' | 'input' | 'screenshot' | 'error' | 'result';
  message: string;
  details?: unknown;
  growth?: GrowthRunIdentity;
}
export interface RunSummary {
  id: string;
  platform: Platform;
  action: Action;
  state: RunState;
  createdAt: string;
  ownerId?: string;
  conversationId?: string;
  workflowId?: string;
  workflowRevision?: number;
  checkpoint?: { id: string; message: string };
  currentStepId?: string;
  completedStepIds?: string[];
  error?: string;
  growth?: GrowthRunIdentity;
  historyIncomplete?: boolean;
  cleanupComplete?: boolean;
  terminalEventId?: number;
}
