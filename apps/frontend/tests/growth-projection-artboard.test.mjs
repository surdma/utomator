import { expect, test } from 'vitest';
import { buildGrowthGraph } from '../modules/growth/components/growth-graph-model.ts';

const stage = {
  id: 'inspect',
  title: 'Pinned title',
  action: 'audit',
  page: 'profile',
  dependsOn: 'none',
  sectionIds: [],
  stepCount: 1,
  plan: {
    steps: [{ id: 'actual', title: 'Actual pinned task', kind: 'inspect' }],
    links: [],
  },
};
test('Growth artboard consumes a shared projection instead of conflicting raw journal', () => {
  const projected = {
    runId: 'run',
    workflowId: 'growth',
    pipelines: [
      {
        id: 'inspect',
        state: 'blocked',
        tasks: [
          { id: 'actual', state: 'blocked', failure: 'Provider blocked' },
        ],
      },
    ],
  };
  const program = {
    id: 'growth',
    title: 'Growth',
    coverage: [],
    stages: [stage],
  };
  const run = { id: 'run', pipelineRuns: [] };
  const overview = buildGrowthGraph(program, run, null, projected);
  expect(overview.nodes[0].data.state).toBe('blocked');
  const tasks = buildGrowthGraph(program, run, stage, projected);
  expect(tasks.nodes[0].data.state).toBe('blocked');
  expect(tasks.nodes[0].data.failure).toBe('Provider blocked');
});
