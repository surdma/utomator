export type Platform = 'linkedin' | 'x';
export type Action = 'audit' | 'edit-profile' | 'add-skill' | 'compose-post' | 'pin-post' | 'delete-post' | 'edit-experience' | 'edit-website' | 'edit-services' | 'add-project' | 'add-featured' | 'upload-banner';
export type RunState = 'running' | 'input-needed' | 'approval-needed' | 'completed' | 'blocked' | 'failed' | 'cancelled';
export interface RunRequest {
  platform: Platform;
  action: Action;
  profileUrl: string;
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
}
export interface RunSummary {
  id: string;
  platform: Platform;
  action: Action;
  state: RunState;
  createdAt: string;
  checkpoint?: { id: string; message: string };
  error?: string;
}
