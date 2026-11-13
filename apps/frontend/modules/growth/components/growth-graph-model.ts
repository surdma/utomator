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

export function buildGrowthGraph(
  program: GrowthGraphProgram,
  run: GrowthGraphRun,
  selected: GrowthGraphStage | null,
  projection?: GrowthExecutionProjection | null,
): { nodes: GrowthGraphNode[]; edges: Edge[] } {
  const execution =
    run && projection?.runId === run.id && projection.workflowId === program.id
      ? projection
      : null;
  const missingState = run ? 'unavailable' : 'waiting';
  if (selected) {
    const projected = execution?.pipelines.find(
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
        state: taskById.get(step.id)?.state ?? missingState,
        failure: taskById.get(step.id)?.failure,
      },
    }));
    const edges: Edge[] = selected.plan.links.map((link) => ({
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      style: { stroke: '#64748b', strokeWidth: 2 },
      animated: taskById.get(link.target)?.state === 'running',
    }));
    return { nodes, edges };
  }

  const projectedById = new Map(
    execution?.pipelines.map((item) => [item.id, item]) ?? [],
  );
  const nodes: GrowthGraphNode[] = program.stages.map((stage, index) => {
    const projected = projectedById.get(stage.id);
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
        state: projected?.state ?? missingState,
        failure: projected?.tasks.find((task) => task.failure)?.failure,
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
      animated: projectedById.get(stage.id)?.state === 'running',
    }));
  return { nodes, edges };
}
