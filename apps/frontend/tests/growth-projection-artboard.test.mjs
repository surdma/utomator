import { test, expect } from 'vitest';
import { buildGrowthGraph } from '../components/dashboard/growth/growth-graph-model.ts';

const stage = {
  id: 'inspect', title: 'Pinned title', action: 'audit', page: 'profile',
  dependsOn: 'none', sectionIds: [], stepCount: 1,
  plan: { steps: [{id:'actual',title:'Actual pinned task',kind:'inspect'}], links: [] },
};
test('Growth artboard consumes a shared projection instead of conflicting raw journal', () => {
  const projected = {
    pipelines: [{
      id: 'inspect', state: 'blocked',
      tasks: [{id:'actual',state:'blocked',failure:'Provider blocked'}],
    }],
  };
  const program = { id:'growth',title:'Growth', coverage: [], stages:[stage] };
  const overview = buildGrowthGraph(program, null, null, [], undefined, projected);
  expect(overview.nodes[0].data.state).toBe('blocked');
  const tasks = buildGrowthGraph(program, null, stage, [], undefined, projected);
  expect(tasks.nodes[0].data.state).toBe('blocked');
  expect(tasks.nodes[0].data.failure).toBe('Provider blocked');
});
