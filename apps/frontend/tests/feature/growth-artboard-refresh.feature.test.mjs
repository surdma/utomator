// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { projectGrowthExecution } from '../../modules/growth/model/growth-execution-projection.ts';
import { defaultWorkflowPlan } from '../../modules/pipeline/components/default-workflow-plan.ts';
import WorkflowPlanEditor from '../../modules/workflows/components/workflow-plan-editor.tsx';
import {
  childId,
  growthRun,
  journals,
} from '../support/growth-execution-fixture.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const observers = new Set();
let root;
let container;

function dimensions(element) {
  if (element.classList.contains('react-flow__node'))
    return { width: 228, height: 170 };
  if (element.classList.contains('react-flow__handle'))
    return { width: 12, height: 12 };
  return { width: 900, height: 600 };
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      targets = new Set();
      constructor(callback) {
        this.callback = callback;
        observers.add(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      unobserve(target) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
        observers.delete(this);
      }
      notify() {
        this.callback(
          [...this.targets]
            .filter((target) => target.isConnected)
            .map((target) => ({
              target,
              contentRect: target.getBoundingClientRect(),
            })),
          this,
        );
      }
    },
  );
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22 = 1;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function () {
      return dimensions(this).width;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function () {
      return dimensions(this).height;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function () {
      const { width, height } = dimensions(this);
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON() {},
      };
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ start: { fields: [] } }), {
          status: 200,
        }),
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function editor(state, stageId = 'inspect') {
  const run = growthRun({ status: 'active', state });
  run.stages[0].id = stageId;
  run.pipelineRuns[0].id = stageId;
  run.pipelineRuns[0].growth.stageId = stageId;
  run.pipelineRuns[0].state = state;
  run.currentChild = { id: childId, state };
  run.stages[0] = {
    ...run.stages[0],
    sectionIds: [],
    action: 'audit',
    page: 'profile',
  };
  run.currentStage = run.stages[0];
  run.counts = { total: 0, missing: 0, ownerSupplied: 0 };
  run.coverage = [];
  const program = {
    id: run.programId,
    title: 'Profile audit',
    requirements: [],
    pipelines: [],
    coverage: [],
    stages: [{ ...run.currentStage, stepCount: 2 }],
  };
  const history = journals();
  for (const event of history[childId].events) event.growth.stageId = stageId;
  return createElement(WorkflowPlanEditor, {
    plan: defaultWorkflowPlan(),
    templates: [],
    events: [],
    busy: false,
    dirty: false,
    saving: false,
    connected: true,
    growthTemplateId: run.programId,
    growthState: {
      run: state === 'waiting' ? null : run,
      program,
      endpoint: '/api/growth/templates/linkedin-profile',
      error: '',
      working: false,
      mutate: async () => {},
      setRun() {},
    },
    growthExecution: {
      projection:
        state === 'waiting' ? null : projectGrowthExecution(run, history),
      error: '',
    },
    onPlanChange() {},
    onTemplateApply: async () => {},
    onSave: async () => {},
  });
}

async function measureNodes() {
  await act(async () => {
    for (const observer of observers) observer.notify();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

function wrapper(testId) {
  return container
    .querySelector(`[data-testid="${testId}"]`)
    ?.closest('.react-flow__node');
}

test('live Growth updates retain measured pipeline and task cards without a new resize', async () => {
  await act(async () => root.render(editor('running')));
  await measureNodes();
  const pipeline = wrapper('growth-pipeline-node-inspect');
  expect(pipeline?.style.visibility).toBe('visible');
  const position = pipeline.style.transform;

  await act(async () => root.render(editor('completed')));
  expect(wrapper('growth-pipeline-node-inspect')?.style.visibility).toBe(
    'visible',
  );
  expect(wrapper('growth-pipeline-node-inspect')?.style.transform).toBe(
    position,
  );
  expect(wrapper('growth-pipeline-node-inspect')?.textContent).toContain(
    'completed',
  );

  await act(async () => {
    container
      .querySelector('[data-testid="growth-pipeline-node-inspect"]')
      .click();
  });
  await measureNodes();
  expect(wrapper('growth-task-node-baseline')?.style.visibility).toBe(
    'visible',
  );
  await act(async () => root.render(editor('cancelled')));
  expect(wrapper('growth-task-node-baseline')?.style.visibility).toBe(
    'visible',
  );
  expect(wrapper('growth-task-node-baseline')?.textContent).toContain(
    'cancelled',
  );
});

test('starting a run retains the already measured overview without a new resize', async () => {
  await act(async () => root.render(editor('waiting')));
  await measureNodes();
  expect(wrapper('growth-pipeline-node-inspect')?.style.visibility).toBe(
    'visible',
  );
  expect(wrapper('growth-pipeline-node-inspect')?.textContent).toContain(
    'waiting',
  );
  await act(async () => root.render(editor('running')));
  expect(wrapper('growth-pipeline-node-inspect')?.style.visibility).toBe(
    'visible',
  );
  expect(wrapper('growth-pipeline-node-inspect')?.textContent).toContain(
    'running',
  );
});

test('a task with the same ID as its pipeline receives its own measurement', async () => {
  await act(async () => root.render(editor('completed', 'observe')));
  await measureNodes();
  expect(wrapper('growth-pipeline-node-observe')?.style.visibility).toBe(
    'visible',
  );
  await act(async () =>
    container
      .querySelector('[data-testid="growth-pipeline-node-observe"]')
      .click(),
  );
  expect(wrapper('growth-task-node-observe')?.style.visibility).toBe('hidden');
  await measureNodes();
  expect(wrapper('growth-task-node-observe')?.style.visibility).toBe('visible');
  await act(async () => root.render(editor('cancelled', 'observe')));
  expect(wrapper('growth-task-node-observe')?.style.visibility).toBe('visible');
});
