import type { Edge, Node } from '@xyflow/react';
import type { StepKind, WorkflowPlan } from '@/modules/workflows';
import type { GrowthExecutionProjection } from '../model/growth-execution-projection';

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
  kind?: 'GrowthProfileWorkflow' | 'GrowthWorkflow' | 'GrowthBlueprintWorkflow';
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
  index: number;
  total: number;
  stepKind?: StepKind;
  stepCount?: number;
  designOnly: boolean;
  failure?: string;
};

export type GrowthGraphNode = Node<GrowthGraphData, 'growthNode'>;

export function getGrowthTaskStates(
  journal: GrowthJournalEvent[],
  live: GrowthPipelineRun | undefined,
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
  live: GrowthPipelineRun | undefined,
  projection?: GrowthExecutionProjection | null,
): { nodes: GrowthGraphNode[]; edges: Edge[] } {
  if (selected) {
    const taskStates = getGrowthTaskStates(journal, live);
    const projected = projection?.pipelines.find(
      (item) => item.id === selected.id,
    );
    const taskById = new Map(
      projected?.tasks.map((task) => [task.id, task]) ?? [],
    );
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
        index: index + 1,
        total: selected.plan.steps.length,
        stepKind: step.kind,
        designOnly: program.kind === 'GrowthBlueprintWorkflow',
        label: step.title,
        subtitle: `${step.kind.replaceAll('-', ' ')} step`,
        state:
          taskById.get(step.id)?.state ?? taskStates.get(step.id) ?? 'waiting',
        failure:
          taskById.get(step.id)?.failure ??
          (taskStates.get(step.id) === 'failed'
            ? (journal
                .filter(
                  (event) =>
                    event.details?.stepId === step.id &&
                    event.details?.stage === 'failed',
                )
                .at(-1)?.details?.reason ??
              live?.error ??
              undefined)
            : undefined),
      },
    }));
    const edges: Edge[] = selected.plan.links.map((link) => ({
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      animated:
        taskById.get(link.target)?.state === 'running' ||
        (!taskById.has(link.target) &&
          taskStates.get(link.target) === 'started'),
    }));
    return { nodes, edges };
  }

  const pipelineById = new Map(
    run?.pipelineRuns.map((item) => [item.id, item]) ?? [],
  );
  const projectedById = new Map(
    projection?.pipelines.map((item) => [item.id, item]) ?? [],
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
        index: index + 1,
        total: program.stages.length,
        stepCount: stage.stepCount,
        designOnly: program.kind === 'GrowthBlueprintWorkflow',
        label: stage.title,
        subtitle:
          stage.stepCount +
          ' steps · ' +
          stage.sectionIds.length +
          ' coverage requirements',
        state: projectedById.get(stage.id)?.state ?? state?.state ?? 'waiting',
        failure: state?.error ?? undefined,
      },
    };
  });
  const edges: Edge[] = program.stages
    .filter((stage) => stage.dependsOn !== 'none')
    .map((stage) => ({
      id: `${stage.dependsOn}-${stage.id}`,
      source: stage.dependsOn,
      target: stage.id,
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      animated: pipelineById.get(stage.id)?.state === 'running',
    }));
  return { nodes, edges };
}
