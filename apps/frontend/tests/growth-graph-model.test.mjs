import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGrowthGraph,
  getGrowthTaskStates,
} from '../components/automate/growth-graph-model.ts';

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
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['audit', 'review']
  );
  assert.deepEqual(
    graph.edges.map((edge) => [edge.source, edge.target, edge.animated]),
    [['audit', 'review', true]]
  );
  assert.equal(graph.nodes[0].data.state, 'completed');
  assert.equal(graph.nodes[1].data.state, 'running');
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
  assert.equal(getGrowthTaskStates(journal, live).get('inspect'), 'failed');
  const graph = buildGrowthGraph(
    program,
    { id: 'r1', pipelineRuns: [live] },
    stage,
    journal,
    live
  );
  assert.equal(graph.nodes[1].data.state, 'failed');
  assert.equal(graph.nodes[1].data.failure, 'Could not inspect');
  assert.deepEqual(
    graph.edges.map((edge) => [edge.source, edge.target, edge.animated]),
    [['start', 'inspect', false]]
  );
});

test('missing run evidence stays waiting and cannot imply completion', () => {
  const graph = buildGrowthGraph(program, null, null, [], undefined);
  assert.equal(graph.nodes[0].data.state, 'waiting');
  assert.equal(graph.nodes[1].data.state, 'waiting');
  assert.equal(graph.edges[0].animated, false);
});
