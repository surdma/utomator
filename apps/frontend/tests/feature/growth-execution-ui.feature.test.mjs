// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import GrowthWorkspaceDialogs from '../../modules/growth/components/growth-workspace-dialogs.tsx';
import GrowthRunControls from '../../modules/growth/components/run-controls.tsx';
import { projectGrowthExecution } from '../../modules/growth/model/growth-execution-projection.ts';
import { MatorPipelineExecution } from '../../modules/mator/components/chat/mator-pipeline-execution.tsx';
import { defaultWorkflowPlan } from '../../modules/pipeline/components/default-workflow-plan.ts';
import WorkflowPlanEditor from '../../modules/workflows/components/workflow-plan-editor.tsx';
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

function artboardRun() {
  const run = controlsRun('completed');
  run.coverage = [];
  run.currentPageEvidence = run.stages[0].pageEvidence;
  const first = run.stages[0];
  for (let index = 1; index < 6; index++) {
    const id = `pipeline-${index + 1}`;
    run.stages.push({
      ...structuredClone(first),
      id,
      title: `Pipeline ${index + 1}`,
      dependsOn: run.stages[index - 1].id,
      childRunId: null,
      pageEvidence: null,
    });
    run.pipelineRuns.push({
      id,
      childRunId: null,
      state: 'waiting',
      currentStepId: null,
      error: null,
    });
  }
  return run;
}

function artboardFooter(run, execution, kind = 'GrowthProfileWorkflow') {
  const stages = (run?.stages ?? growthRun().stages).map((stage) => ({
    ...stage,
    action: 'audit',
    page: 'profile',
    sectionIds: [],
    stepCount: stage.plan.steps.length,
  }));
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    createElement(WorkflowPlanEditor, {
      plan: defaultWorkflowPlan(),
      templates: [],
      events: [],
      busy: false,
      dirty: false,
      saving: false,
      connected: true,
      growthTemplateId: 'linkedin-profile',
      growthState: {
        run: run ? { ...run, stages } : null,
        program: {
          id: 'linkedin-profile',
          title: 'Profile audit',
          kind,
          stages,
          requirements: [],
          coverage: [],
          pipelines: [],
        },
        endpoint: '/api/growth/templates/linkedin-profile',
        working: false,
        error: '',
        mutate: async () => {},
        setRun() {},
      },
      growthExecution: { projection: execution, error: '' },
      onPlanChange() {},
      onTemplateApply: async () => {},
      onSave: async () => {},
    }),
  );
  const controls = [...host.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Run controls and evidence'),
  );
  expect(controls).toBeDefined();
  return controls.parentElement.querySelector('span').textContent;
}

test('artboard footer cannot certify raw completion with incomplete or missing journal projection', () => {
  const run = artboardRun();
  const incomplete = projectGrowthExecution(run, journals(undefined, false));
  for (const projection of [incomplete, null]) {
    const footer = artboardFooter(run, projection);
    expect(footer).toContain('Current pipeline: unavailable');
    expect(footer).not.toContain('completed');
  }
});

test.each([
  ['runId', '33333333-3333-4333-8333-333333333333'],
  ['workflowId', 'another-program'],
  ['workflowRevision', 99],
  ['sourceDigest', '9'.repeat(64)],
])(
  'artboard footer rejects a projection with mismatched %s',
  (field, value) => {
    const run = artboardRun();
    const execution = projectGrowthExecution(run, journals());
    execution[field] = value;
    expect(artboardFooter(run, execution)).toContain(
      'Current pipeline: unavailable',
    );
  },
);

test('artboard footer limits verified completion to the current pipeline of a six-stage program', () => {
  const run = artboardRun();
  const execution = projectGrowthExecution(run, journals());
  expect(execution.pipelines.map((pipeline) => pipeline.state)).toEqual([
    'completed',
    'waiting',
    'waiting',
    'waiting',
    'waiting',
    'waiting',
  ]);
  const footer = artboardFooter(run, execution);
  expect(footer).toContain('Current pipeline: completed');
  expect(footer).not.toContain('Growth execution: completed');
});

test('artboard footer rejects a prior child projection after the current child changes', () => {
  const run = artboardRun();
  const execution = projectGrowthExecution(run, journals());
  run.currentStage.childRunId = '33333333-3333-4333-8333-333333333333';
  run.currentChild.id = run.currentStage.childRunId;
  expect(artboardFooter(run, execution)).toContain(
    'Current pipeline: unavailable',
  );
});

test('artboard footer follows the newly active pipeline rather than the first completed pipeline', () => {
  const run = artboardRun();
  const nextChildId = '33333333-3333-4333-8333-333333333333';
  const next = run.stages[1];
  const source = { ...run.pipelineRuns[0].growth, stageId: next.id };
  next.childRunId = nextChildId;
  run.activeIndex = 1;
  run.currentStage = next;
  run.currentChild = { id: nextChildId, state: 'running' };
  run.state = 'running';
  run.pipelineRuns[1] = {
    ...run.pipelineRuns[1],
    childRunId: nextChildId,
    state: 'running',
    currentStepId: 'observe',
    growth: source,
  };
  const execution = projectGrowthExecution(run, {
    ...journals(),
    [nextChildId]: {
      runId: nextChildId,
      complete: true,
      events: [
        recordedEvent(1, 'observe', 'started', {
          runId: nextChildId,
          growth: source,
        }),
      ],
    },
  });
  expect(artboardFooter(run, execution)).toContain('Current pipeline: running');
});

test('artboard footer does not turn pending cleanup into completion', () => {
  const run = artboardRun();
  run.releasePending = true;
  const execution = projectGrowthExecution(run, journals());
  const footer = artboardFooter(run, execution);
  expect(footer).toContain('Current pipeline: finalizing');
  expect(footer).not.toContain('completed');
});

test('artboard footer keeps the planning-only and not-started states', () => {
  expect(artboardFooter(null, null)).toContain('not started');
  expect(artboardFooter(null, null, 'GrowthBlueprintWorkflow')).toBe(
    'Planning-only workflow',
  );
});
