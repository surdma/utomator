import { expect, test } from 'vitest';
import {
  buildGrowthGraph,
  getGrowthTaskStates,
} from '../modules/growth/components/growth-graph-model.ts';

const stage = {
  id: 'audit',
  title: 'Audit',
  action: 'audit',
  page: 'profile',
  dependsOn: 'none',
  sectionIds: ['headline'],
  stepCount: 2,
  plan: {
    steps: [
      { id: 'start', title: 'Start', kind: 'start' },
      { id: 'inspect', title: 'Inspect', kind: 'inspect' },
    ],
    links: [{ source: 'start', target: 'inspect' }],
  },
};
const next = { ...stage, id: 'review', title: 'Review', dependsOn: 'audit' };
const program = {
  id: 'growth',
  title: 'Growth',
  coverage: [],
  stages: [stage, next],
};

test('pipeline graph preserves dependencies and real run state', () => {
  const run = {
    id: 'r1',
    pipelineRuns: [
      {
        id: 'audit',
        childRunId: 'c1',
        state: 'completed',
        currentStepId: null,
        error: null,
      },
      {
        id: 'review',
        childRunId: 'c2',
        state: 'running',
        currentStepId: null,
        error: null,
      },
    ],
  };
  const graph = buildGrowthGraph(program, run, null, [], undefined);
  expect(graph.nodes.map((node) => node.id)).toEqual(['audit', 'review']);
  expect(
    graph.edges.map((edge) => [edge.source, edge.target, edge.animated]),
  ).toEqual([['audit', 'review', true]]);
  expect(graph.nodes[0].data.state).toEqual('completed');
  expect(graph.nodes[1].data.state).toEqual('running');
});

test('failed task comes from persisted journal and active Runner checkpoint', () => {
  const live = {
    id: 'audit',
    childRunId: 'c1',
    state: 'blocked',
    currentStepId: 'inspect',
    error: 'Provider blocked',
  };
  const journal = [
    {
      kind: 'task',
      message: 'Starting',
      details: { stepId: 'inspect', stage: 'started' },
    },
    {
      kind: 'task',
      message: 'Blocked',
      details: {
        stepId: 'inspect',
        stage: 'failed',
        reason: 'Could not inspect',
      },
    },
  ];
  expect(getGrowthTaskStates(journal, live).get('inspect')).toEqual('failed');
  const graph = buildGrowthGraph(
    program,
    { id: 'r1', pipelineRuns: [live] },
    stage,
    journal,
    live,
  );
  expect(graph.nodes[1].data.state).toEqual('failed');
  expect(graph.nodes[1].data.failure).toEqual('Could not inspect');
  expect(
    graph.edges.map((edge) => [edge.source, edge.target, edge.animated]),
  ).toEqual([['start', 'inspect', false]]);
});

test('missing run evidence stays waiting and cannot imply completion', () => {
  const graph = buildGrowthGraph(program, null, null, [], undefined);
  expect(graph.nodes[0].data.state).toEqual('waiting');
  expect(graph.nodes[1].data.state).toEqual('waiting');
  expect(graph.edges[0].animated).toEqual(false);
});

test('pipeline and task cards receive numbered step metadata and real step kinds', () => {
  const overview = buildGrowthGraph(program, null, null, [], undefined);
  expect(overview.nodes[0].data.kind).toEqual('pipeline');
  expect(overview.nodes[0].data.index).toEqual(1);
  expect(overview.nodes[0].data.stepCount).toEqual(2);
  const tasks = buildGrowthGraph(program, null, stage, [], undefined);
  expect(tasks.nodes[0].data.kind).toEqual('task');
  expect(tasks.nodes[0].data.index).toEqual(1);
  expect(tasks.nodes[0].data.stepKind).toEqual('start');
  expect(tasks.nodes[1].data.stepKind).toEqual('inspect');
  expect(tasks.nodes[1].data.designOnly).toEqual(false);
  const designOnly = buildGrowthGraph(
    { ...program, kind: 'GrowthBlueprintWorkflow' },
    null,
    stage,
    [],
    undefined,
  );
  expect(designOnly.nodes[1].data.designOnly).toEqual(true);
});
