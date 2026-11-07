import { expect, test } from 'vitest';
import { projectGrowthExecution } from '../modules/growth/model/growth-execution-projection.ts';

const run = (override = {}) => ({
  id: 'parent',
  programId: 'linkedin-profile',
  programVersion: 2,
  sourceDigest: 'pinned',
  status: 'active',
  activeIndex: 0,
  releasePending: false,
  currentChild: null,
  stages: [
    {
      id: 'inspect',
      title: 'Profile inspection',
      dependsOn: 'none',
      childRunId: 'child-1',
      pageEvidence: null,
      plan: {
        steps: [
          { id: 'session', title: 'Session', kind: 'session' },
          { id: 'observe', title: 'Observe', kind: 'inspect' },
        ],
      },
    },
  ],
  pipelineRuns: [
    {
      id: 'inspect',
      childRunId: 'child-1',
      state: 'running',
      currentStepId: 'observe',
      error: null,
    },
  ],
  ...override,
});
const event = (id, stage, stepId = 'observe') => ({
  id,
  runId: 'child-1',
  time: '2026-11-05T00:00:00Z',
  kind: 'step',
  message: stage,
  details: { stepId, stage },
});
const journal = (events, complete = true) => ({
  'child-1': { runId: 'child-1', events, complete },
});

test('pinned task structure is waiting without observed completion', () => {
  const projected = projectGrowthExecution(run(), journal([]));
  expect(projected.workflowRevision).toBe(2);
  expect(projected.pipelines[0].tasks.map((t) => t.state)).toEqual([
    'waiting',
    'running',
  ]);
  expect(projected.pipelines[0].completed).toBe(0);
});

test('task lifecycle advances once for same task identity', () => {
  const p = projectGrowthExecution(
    run(),
    journal([event(2, 'completed'), event(1, 'started')]),
  );
  expect(p.pipelines[0].tasks[1].state).toBe('completed');
  expect(p.pipelines[0].completed).toBe(1);
});

test('cross-run, malformed and duplicate conflicting events cannot forge completion', () => {
  const old = event(1, 'started');
  const fake = event(1, 'completed');
  const p = projectGrowthExecution(
    run(),
    journal([old, fake, { ...event(2, 'completed'), runId: 'other' }]),
  );
  expect(p.pipelines[0].historyIncomplete).toBe(true);
  expect(p.pipelines[0].completed).toBe(0);
});

test('child complete is finalizing without recorded evidence and browser cleanup', () => {
  const r = run({
    pipelineRuns: [
      {
        id: 'inspect',
        childRunId: 'child-1',
        state: 'completed',
        currentStepId: 'observe',
        error: null,
      },
    ],
  });
  expect(
    projectGrowthExecution(r, journal([event(1, 'completed')])).pipelines[0]
      .state,
  ).toBe('finalizing');
  const proved = run({
    ...r,
    stages: [
      {
        ...r.stages[0],
        pageEvidence: { url: 'https://example.com', digest: 'abc' },
      },
    ],
  });
  expect(
    projectGrowthExecution(proved, journal([event(1, 'completed')]))
      .pipelines[0].state,
  ).toBe('completed');
});

test('approval checkpoint comes only from current real child', () => {
  const waiting = run({
    currentChild: {
      id: 'child-1',
      checkpoint: { id: 'gate', message: 'Approve' },
    },
    pipelineRuns: [
      {
        id: 'inspect',
        childRunId: 'child-1',
        state: 'approval-needed',
        currentStepId: 'observe',
        error: null,
      },
    ],
  });
  const p = projectGrowthExecution(waiting, journal([event(1, 'started')]));
  expect(p.pipelines[0].tasks[1].checkpointId).toBe('gate');
  const wrong = projectGrowthExecution(
    {
      ...waiting,
      currentChild: { id: 'other', checkpoint: { id: 'fake', message: 'No' } },
    },
    journal([]),
  );
  expect(wrong.pipelines[0].tasks[1].checkpointId).toBeUndefined();
});

test('unknown child and missing journal show unavailable or incomplete, never done', () => {
  const r = run({
    pipelineRuns: [
      {
        id: 'inspect',
        childRunId: 'other',
        state: 'completed',
        currentStepId: 'observe',
        error: null,
      },
    ],
  });
  const p = projectGrowthExecution(r, {});
  expect(p.pipelines[0].state).toBe('unavailable');
  expect(p.pipelines[0].historyIncomplete).toBe(true);
});

test('screenshots require explicit matching step ID', () => {
  const shot = {
    ...event(1, 'capture'),
    kind: 'screenshot',
    details: { fileName: 'proof.png', stepId: 'observe' },
  };
  const foreign = { ...shot, id: 2, details: { fileName: 'unattributed.png' } };
  const p = projectGrowthExecution(run(), journal([shot, foreign]));
  expect(p.pipelines[0].tasks[1].screenshots).toEqual(['proof.png']);
  expect(p.pipelines[0].unattributedCount).toBe(1);
});

test('unknown IDs in one pinned stage reject the release', () => {
  const r = run();
  r.stages[0].plan.steps.push({
    id: 'session',
    title: 'Duplicate',
    kind: 'start',
  });
  expect(() => projectGrowthExecution(r, {})).toThrow(
    /duplicate pinned task ID/i,
  );
});
