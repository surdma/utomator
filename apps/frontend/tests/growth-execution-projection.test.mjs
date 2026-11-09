import { expect, test } from 'vitest';
import { projectGrowthExecution } from '../modules/growth/model/growth-execution-projection.ts';
import {
  childId,
  completedEvents,
  growthRun,
  journals,
  recordedEvent,
  stepDigests,
} from './support/growth-execution-fixture.mjs';

test('pinned task structure is waiting without observed completion', () => {
  const run = growthRun({ status: 'active' });
  run.pipelineRuns[0].state = 'running';
  const projected = projectGrowthExecution(run, journals([]));
  expect(projected.workflowRevision).toBe(2);
  expect(projected.pipelines[0].tasks.map((task) => task.state)).toEqual([
    'waiting',
    'running',
  ]);
  expect(projected.pipelines[0].completed).toBe(0);
});

test('task lifecycle is deterministic for shuffled and identical duplicate events', () => {
  const events = completedEvents();
  const projection = projectGrowthExecution(
    growthRun(),
    journals([...events].reverse().concat(events[0])),
  );
  expect(projection.pipelines[0].tasks.map((task) => task.state)).toEqual([
    'completed',
    'completed',
  ]);
  expect(projection.pipelines[0].completed).toBe(2);
});

test('cross-run, malformed and duplicate conflicting events cannot forge completion', () => {
  const started = recordedEvent(1, 'observe', 'started');
  const fake = recordedEvent(1, 'observe', 'completed');
  const projection = projectGrowthExecution(
    growthRun(),
    journals([
      started,
      fake,
      { ...recordedEvent(2, 'baseline', 'completed'), runId: 'other' },
    ]),
  );
  expect(projection.pipelines[0].historyIncomplete).toBe(true);
  expect(projection.pipelines[0].completed).toBe(0);
});

test('child complete remains finalizing without matched evidence or browser cleanup', () => {
  const run = growthRun();
  run.stages[0].pageEvidence = null;
  expect(projectGrowthExecution(run, journals()).pipelines[0].state).toBe(
    'finalizing',
  );
  const closing = growthRun();
  closing.pipelineRuns[0].cleanupComplete = false;
  expect(projectGrowthExecution(closing, journals()).pipelines[0].state).toBe(
    'finalizing',
  );
  expect(
    projectGrowthExecution(growthRun(), journals()).pipelines[0].state,
  ).toBe('completed');
});

test('approval checkpoint requires the current child and its persisted announcement', () => {
  const run = growthRun({
    status: 'active',
    currentChild: {
      id: childId,
      checkpoint: { id: 'gate', message: 'Approve' },
    },
  });
  run.pipelineRuns[0].state = 'approval-needed';
  const events = completedEvents().slice(0, 3);
  events.push(
    recordedEvent(4, 'baseline', 'review', {
      kind: 'approval',
      details: {
        stepId: 'baseline',
        checkpointId: 'gate',
        attempt: 1,
        yamlSha256: stepDigests.baseline,
      },
    }),
  );
  expect(
    projectGrowthExecution(run, journals(events)).pipelines[0].tasks[1]
      .checkpointId,
  ).toBe('gate');
  expect(
    projectGrowthExecution(run, journals(events.slice(0, 3))).pipelines[0]
      .tasks[1].checkpointId,
  ).toBeUndefined();
  run.currentChild.id = 'other';
  expect(
    projectGrowthExecution(run, journals(events)).pipelines[0].tasks[1]
      .checkpointId,
  ).toBeUndefined();
});

test('unknown child and missing journal show unavailable rather than done', () => {
  const run = growthRun();
  run.pipelineRuns[0].childRunId = 'other';
  const pipeline = projectGrowthExecution(run, {}).pipelines[0];
  expect(pipeline.state).toBe('unavailable');
  expect(pipeline.historyIncomplete).toBe(true);
});

test('screenshots require explicit matching step and evidence identity', () => {
  const shot = recordedEvent(6, 'observe', 'capture', {
    kind: 'screenshot',
    details: {
      fileName: 'proof.png',
      evidenceId: `${childId}:proof.png`,
      stepId: 'observe',
      attempt: 1,
      yamlSha256: stepDigests.observe,
    },
  });
  const orphan = { ...shot, id: 7, details: { fileName: 'unattributed.png' } };
  const pipeline = projectGrowthExecution(
    growthRun(),
    journals([...completedEvents(), shot, orphan]),
  ).pipelines[0];
  expect(pipeline.tasks[0].screenshots).toEqual(['proof.png']);
  expect(pipeline.unattributedCount).toBe(1);
});

test('duplicate IDs in a pinned stage reject the release', () => {
  const run = growthRun();
  run.stages[0].plan.steps.push({
    id: 'observe',
    title: 'Duplicate',
    kind: 'inspect',
  });
  expect(() => projectGrowthExecution(run, {})).toThrow(
    /duplicate pinned task ID/i,
  );
});
