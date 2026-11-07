import type { WorkflowPlan } from '@/modules/workflows';

export type Stage = {
  id: string;
  title: string;
  action: 'audit' | 'audit-page' | 'manual';
  execution?: 'existing-runner' | 'design-only';
  page: string;
  dependsOn: string;
  sectionIds: string[];
  stepCount: number;
  plan: WorkflowPlan;
};
export type Program = {
  id: string;
  title: string;
  objective: string;
  limitation: string;
  kind?: 'GrowthProfileWorkflow' | 'GrowthWorkflow' | 'GrowthBlueprintWorkflow';
  executable?: boolean;
  stages: Stage[];
  requirements: Array<{ id: string; text: string }>;
  coverage: Array<{ id: string; label: string; status: string }>;
  pipelines: Array<{
    id: string;
    action: string;
    title: string;
    stepCount: number;
  }>;
};
export type Child = {
  id: string;
  state: string;
  checkpoint?: { id: string; message: string };
  error?: string;
};
export type Evidence = {
  source: 'owner-supplied';
  excerpt: string;
  digest: string;
  capturedAt: string;
};
export type Run = {
  id: string;
  programId?: string;
  programVersion?: number;
  sourceDigest?: string;
  stages?: Array<
    Omit<Stage, 'stepCount'> & {
      childRunId: string | null;
      pageEvidence?: { url: string; digest: string } | null;
    }
  >;
  accountId: string;
  status: string;
  state: string;
  activeIndex: number;
  currentChild: Child | null;
  currentStage: Omit<Stage, 'plan' | 'stepCount'> & {
    childRunId: string | null;
  };
  pipelineRuns: Array<{
    id: string;
    childRunId: string | null;
    state: string;
    currentStepId: string | null;
    error: string | null;
  }>;
  currentPageEvidence: { url: string; digest: string } | null;
  canAdvance: boolean;
  releasePending: boolean;
  coverage: Array<{
    id: string;
    stageId: string;
    status: 'missing' | 'owner-supplied-unverified';
    evidence: Evidence | null;
  }>;
  counts: {
    total: number;
    missing: number;
    ownerSupplied: number;
    independentlyProviderVerified: number;
  };
  outcomeNotice: string;
};
