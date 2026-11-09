import { expect, test } from 'vitest';
import { buildGrowthGraph } from '../../modules/growth/components/growth-graph-model.ts';
import { projectGrowthExecution } from '../../modules/growth/model/growth-execution-projection.ts';
import {
  childId,
  completedEvents,
  growthRun,
  journals,
  recordedEvent,
} from '../support/growth-execution-fixture.mjs';

test('a complete persisted lifecycle proves completion of its pinned source', () => {
  const result = projectGrowthExecution(growthRun(), journals());
  expect(result.pipelines[0].state).toBe('completed');
  expect(result.pipelines[0].tasks.map((task) => task.state)).toEqual([
    'completed',
    'completed',
  ]);
});

test.each([undefined, journals([], false), journals(completedEvents(), false)])(
  'missing or incomplete durable history never shows completed',
  (snapshot) => {
    const pipeline = projectGrowthExecution(growthRun(), snapshot ?? {})
      .pipelines[0];
    expect(pipeline.state).not.toBe('completed');
    expect(pipeline.completed).toBe(0);
    expect(pipeline.historyIncomplete).toBe(true);
  },
);

test.each([
  'sourceDigest',
  'planDigest',
  'parentRunId',
  'stageId',
  'attempt',
  'programVersion',
])('a child registered to a different %s cannot supply progress', (field) => {
  const run = growthRun();
  run.pipelineRuns[0].growth[field] =
    typeof run.pipelineRuns[0].growth[field] === 'number' ? 9 : 'foreign';
  const pipeline = projectGrowthExecution(run, journals()).pipelines[0];
  expect(pipeline.state).toBe('unavailable');
  expect(pipeline.completed).toBe(0);
});

test('legacy child summaries without provenance cannot supply completed state', () => {
  const run = growthRun();
  delete run.pipelineRuns[0].growth;
  expect(projectGrowthExecution(run, journals()).pipelines[0].state).toBe(
    'unavailable',
  );
});

test.each(['attempt', 'yamlSha256', 'outputId', 'outputDigest'])(
  'completion with invalid %s cannot prove its task',
  (field) => {
    const events = completedEvents();
    events[3].details[field] = field === 'attempt' ? 2 : 'wrong';
    const pipeline = projectGrowthExecution(growthRun(), journals(events))
      .pipelines[0];
    expect(pipeline.tasks[1].state).not.toBe('completed');
    expect(pipeline.state).not.toBe('completed');
  },
);

test('a completion without a corresponding start cannot finish a task', () => {
  const events = completedEvents().filter((event) => event.id !== 3);
  const pipeline = projectGrowthExecution(growthRun(), journals(events))
    .pipelines[0];
  expect(pipeline.tasks[1].state).not.toBe('completed');
  expect(pipeline.state).not.toBe('completed');
});

test('conflicting duplicates invalidate success even when another completion remains', () => {
  const events = completedEvents();
  events.push({ ...events[0], message: 'Conflicting persisted event' });
  const pipeline = projectGrowthExecution(growthRun(), journals(events))
    .pipelines[0];
  expect(pipeline.historyIncomplete).toBe(true);
  expect(pipeline.completed).toBe(0);
  expect(pipeline.state).not.toBe('completed');
});

test.each(['cleanup', 'terminal', 'evidence'])(
  'pipeline completion waits for matching %s proof',
  (missing) => {
    const run = growthRun();
    if (missing === 'cleanup') run.pipelineRuns[0].cleanupComplete = false;
    if (missing === 'terminal') run.pipelineRuns[0].terminalEventId = 123;
    if (missing === 'evidence')
      run.stages[0].pageEvidence.outputId = `${childId}:observe:output`;
    expect(projectGrowthExecution(run, journals()).pipelines[0].state).not.toBe(
      'completed',
    );
  },
);

test('orphan and stale-attempt screenshots remain unattributed', () => {
  const screenshot = recordedEvent(6, 'observe', 'capture', {
    kind: 'screenshot',
    details: {
      fileName: 'proof.png',
      evidenceId: `${childId}:proof.png`,
      stepId: 'observe',
      attempt: 1,
      yamlSha256: 'c'.repeat(64),
    },
  });
  const orphan = { ...screenshot, id: 7, details: { fileName: 'orphan.png' } };
  const stale = {
    ...screenshot,
    id: 8,
    details: { ...screenshot.details, fileName: 'stale.png', attempt: 2 },
  };
  const pipeline = projectGrowthExecution(
    growthRun(),
    journals([...completedEvents(), screenshot, orphan, stale]),
  ).pipelines[0];
  expect(pipeline.tasks[0].screenshots).toEqual(['proof.png']);
  expect(pipeline.unattributedCount).toBeGreaterThanOrEqual(2);
});

test('artboard cannot infer completion from a summary without canonical projection', () => {
  const run = growthRun();
  const stage = { ...run.stages[0], sectionIds: [], stepCount: 2 };
  const program = {
    id: run.programId,
    title: 'Growth',
    coverage: [],
    stages: [stage],
  };
  const graph = buildGrowthGraph(program, run, stage, null);
  expect(graph.nodes.map((node) => node.data.state)).toEqual([
    'unavailable',
    'unavailable',
  ]);
  expect(buildGrowthGraph(program, run, null, null).nodes[0].data.state).toBe(
    'unavailable',
  );
});
