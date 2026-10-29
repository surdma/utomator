import type { Edge, Node } from '@xyflow/react';
import type { WorkflowPlan } from './workflow-plan-editor';

export type GrowthGraphStage = {
  id: string;
  title: string;
  action: string;
  page: string;
  dependsOn: string;
  sectionIds: string[];
  plan: WorkflowPlan;
  stepCount: number;
};

export type GrowthGraphProgram = {
  id: string;
  title: string;
  coverage: Array<{ id: string; label: string }>;
  stages: GrowthGraphStage[];
};

export type GrowthPipelineRun = {
  id: string;
  childRunId: string | null;
  state: string;
  currentStepId: string | null;
  error: string | null;
};

export type GrowthGraphRun = {
  id: string;
  pipelineRuns: GrowthPipelineRun[];
} | null;

export type GrowthJournalEvent = {
  kind: string;
  message: string;
  details?: { stepId?: string; stage?: string; reason?: string };
};

export type GrowthGraphData = Record<string, unknown> & {
  label: string;
  subtitle: string;
  state: string;
  nodeId: string;
  kind: 'pipeline' | 'task';
  failure?: string;
};

export type GrowthGraphNode = Node<GrowthGraphData, 'growthNode'>;

export function getGrowthTaskStates(
  journal: GrowthJournalEvent[],
  live: GrowthPipelineRun | undefined
): Map<string, string> {
  const states = new Map<string, string>();
  for (const entry of journal) {
    const id = entry.details?.stepId;
    const stage = entry.details?.stage;
    if (id && stage && ['started', 'completed', 'failed'].includes(stage)) {
      states.set(id, stage);
    }
  }
  if (
    live &&
    ['failed', 'blocked'].includes(live.state) &&
    live.currentStepId
  ) {
    states.set(live.currentStepId, 'failed');
  }
  return states;
}

export function buildGrowthGraph(
  program: GrowthGraphProgram,
  run: GrowthGraphRun,
  selected: GrowthGraphStage | null,
  journal: GrowthJournalEvent[],
  live: GrowthPipelineRun | undefined
): { nodes: GrowthGraphNode[]; edges: Edge[] } {
  if (selected) {
    const taskStates = getGrowthTaskStates(journal, live);
    const nodes: GrowthGraphNode[] = selected.plan.steps.map((step, index) => ({
      id: step.id,
      type: 'growthNode',
      position: step.position ?? {
        x: 35 + (index % 4) * 295,
        y: 50 + Math.floor(index / 4) * 205,
      },
      data: {
        kind: 'task',
        nodeId: step.id,
        label: step.title,
        subtitle:
          step.kind +
          ' · ' +
          String(index + 1) +
          ' of ' +
          selected.plan.steps.length,
        state: taskStates.get(step.id) ?? 'waiting',
        failure:
          taskStates.get(step.id) === 'failed'
            ? (journal
                .filter(
                  (event) =>
                    event.details?.stepId === step.id &&
                    event.details?.stage === 'failed'
                )
                .at(-1)?.details?.reason ??
              live?.error ??
              undefined)
            : undefined,
      },
    }));
    const edges: Edge[] = selected.plan.links.map((link) => ({
      id: link.source + '-' + link.target,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      animated: taskStates.get(link.target) === 'started',
    }));
    return { nodes, edges };
  }

  const pipelineById = new Map(
    run?.pipelineRuns.map((item) => [item.id, item]) ?? []
  );
  const nodes: GrowthGraphNode[] = program.stages.map((stage, index) => {
    const state = pipelineById.get(stage.id);
    return {
      id: stage.id,
      type: 'growthNode',
      position: {
        x: 40 + (index % 3) * 315,
        y: 55 + Math.floor(index / 3) * 250,
      },
      data: {
        kind: 'pipeline',
        nodeId: stage.id,
        label: stage.title,
        subtitle:
          stage.stepCount +
          ' connected tasks · ' +
          stage.sectionIds.length +
          ' coverage requirements',
        state: state?.state ?? 'waiting',
        failure: state?.error ?? undefined,
      },
    };
  });
  const edges: Edge[] = program.stages
    .filter((stage) => stage.dependsOn !== 'none')
    .map((stage) => ({
      id: stage.dependsOn + '-' + stage.id,
      source: stage.dependsOn,
      target: stage.id,
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      animated: pipelineById.get(stage.id)?.state === 'running',
    }));
  return { nodes, edges };
}
