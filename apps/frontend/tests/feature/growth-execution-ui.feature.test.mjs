// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import GrowthWorkspaceDialogs from '../../modules/growth/components/growth-workspace-dialogs.tsx';
import GrowthRunControls from '../../modules/growth/components/run-controls.tsx';
import { projectGrowthExecution } from '../../modules/growth/model/growth-execution-projection.ts';
import { MatorPipelineExecution } from '../../modules/mator/components/chat/mator-pipeline-execution.tsx';
import {
  childId,
  growthRun,
  journals,
  recordedEvent,
} from '../support/growth-execution-fixture.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let container;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = undefined;
});

test('changing execution or checkpoint clears the previous task response', async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const execution = projectGrowthExecution(growthRun(), journals());
  execution.pipelines[0].state = 'input-needed';
  execution.pipelines[0].tasks[1].state = 'input-needed';
  execution.pipelines[0].tasks[1].checkpointId = 'first-checkpoint';
  const render = (value) =>
    createElement(MatorPipelineExecution, {
      execution: value,
      onInput: async () => {},
    });
  await act(async () => root.render(render(execution)));
  const input = container.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set.call(input, 'Private answer for the first run');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe('Private answer for the first run');
  const next = structuredClone(execution);
  next.pipelines[0].tasks[1].checkpointId = 'second-checkpoint';
  await act(async () => root.render(render(next)));
  expect(container.querySelector('input').value).toBe('');
});

test('task details use the same cancelled projection as Mator and the artboard', () => {
  const run = growthRun();
  run.pipelineRuns[0].state = 'cancelled';
  run.counts = {
    ownerSupplied: 0,
    total: 0,
    missing: 0,
    independentlyProviderVerified: 0,
  };
  run.coverage = [];
  run.currentStage = run.stages[0];
  const execution = projectGrowthExecution(run, journals());
  const stage = { ...run.stages[0], sectionIds: [], stepCount: 2 };
  const program = {
    id: run.programId,
    title: 'Profile',
    requirements: [],
    pipelines: [],
    coverage: [],
    stages: [stage],
  };
  const html = renderToStaticMarkup(
    createElement(GrowthWorkspaceDialogs, {
      program,
      run,
      stage,
      execution,
      endpoint: '/api/growth/templates/linkedin-profile',
      busy: false,
      working: false,
      error: '',
      detailsOpen: false,
      taskOpen: true,
      onDetailsClose() {},
      onTaskClose() {},
      setRun() {},
      mutate: async () => {},
      taskId: 'baseline',
      selectedAction: 'audit',
      journalError: '',
      journal: [
        {
          kind: 'step',
          message: 'Untrusted completion',
          details: { stepId: 'baseline', stage: 'completed' },
        },
      ],
    }),
  );
  const host = document.createElement('div');
  host.innerHTML = html;
  const label = [...host.querySelectorAll('dt')].find(
    (item) => item.textContent === 'Recorded state',
  );
  expect(label.nextElementSibling.textContent).toBe('cancelled');
});

function controlsRun(state) {
  const run = growthRun({ status: 'active', state, canAdvance: true });
  run.pipelineRuns[0].state = state;
  run.currentChild = {
    id: childId,
    state,
    checkpoint: { id: 'review-this-evidence', message: 'Review the evidence' },
  };
  run.currentStage = run.stages[0];
  run.counts = { ownerSupplied: 0, total: 1, missing: 1 };
  return run;
}

function controlsText(run, execution) {
  return renderToStaticMarkup(
    createElement(GrowthRunControls, {
      run,
      execution,
      program: { stages: [{}, {}] },
      endpoint: '/api/growth/templates/linkedin-profile',
      busy: false,
      working: false,
      mutate: async () => {},
    }),
  );
}

test.each(['completed', 'approval-needed'])(
  'workspace controls cannot authorize %s from incomplete history',
  (state) => {
    const run = controlsRun(state);
    const execution = projectGrowthExecution(run, journals(undefined, false));
    const html = controlsText(run, execution);
    expect(html).toContain('unavailable');
    expect(html).not.toContain('Advance to the next dependent pipeline');
    expect(html).not.toContain('Approve evidence');
    if (state === 'approval-needed')
      expect(html).toContain('Cancel active Runner pipeline');
  },
);

test('workspace controls retain a durably recorded checkpoint and completed advance', () => {
  const pending = controlsRun('approval-needed');
  const events = [
    recordedEvent(1, 'observe', 'started'),
    recordedEvent(2, 'observe', 'completed'),
    recordedEvent(3, 'baseline', 'started'),
    recordedEvent(4, 'baseline', 'checkpoint', {
      kind: 'approval',
      details: {
        stepId: 'baseline',
        attempt: 1,
        yamlSha256: pending.stages[0].stepDigests.baseline,
        checkpointId: pending.currentChild.checkpoint.id,
      },
    }),
  ];
  expect(
    controlsText(pending, projectGrowthExecution(pending, journals(events))),
  ).toContain('Approve evidence');
  const completed = controlsRun('completed');
  expect(
    controlsText(completed, projectGrowthExecution(completed, journals())),
  ).toContain('Advance to the next dependent pipeline');
});

test('workspace controls cannot advance a cancelled child or use another parent projection', () => {
  const cancelled = controlsRun('cancelled');
  const execution = projectGrowthExecution(cancelled, journals());
  const html = controlsText(cancelled, execution);
  expect(html).toContain('cancelled');
  expect(html).not.toContain('Advance to the next dependent pipeline');
  expect(html).not.toContain('Approve evidence');
  const completed = controlsRun('completed');
  const foreign = projectGrowthExecution(completed, journals());
  foreign.runId = '33333333-3333-4333-8333-333333333333';
  const unavailable = controlsText(completed, foreign);
  expect(unavailable).toContain('unavailable');
  expect(unavailable).not.toContain('Advance to the next dependent pipeline');
});
