
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { AccountStore } from '../src/profile/account-store.js';
import { RunArchive } from '../src/runs/run-archive.js';
import { parseStepDefinition, StepDefinitionStore } from '../src/workflows/step-definitions.js';
import { loadStepForms, parseStepForms } from '../src/workflows/step-forms.js';
import { defaultPlan, templates, validatePlan } from '../src/workflows/workflow-plan.js';
import { WorkflowRegistry } from '../src/workflows/workflow-registry.js';
import { WorkflowPlanStore } from '../src/workflows/workflow-store.js';
import { compileWorkflow } from '../src/workflows/workflow-yaml.js';

// Set test mode before dynamically importing the Fastify entry point.
// Static ESM imports execute before assignments and would start a stray listener.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

import { BrowserSession } from '../src/browser/session.js';

test('YAML step forms expose only known, bounded editable fields', async () => {
  const forms = await loadStepForms();
  expect(forms.delay.fields[0]?.key).toEqual('delayMs');
  expect(forms.delay.fields[0]?.max).toEqual(30000);
  expect(forms.note.fields[0]?.control).toEqual('textarea');
  expect(forms.action.fields.length).toEqual(0);
  const responseApp = buildApp();
  try {
    await responseApp.ready();
    const response = await responseApp.inject({
      method: 'GET',
      url: '/step-forms',
    });
    expect(response.statusCode).toEqual(200);
    const data = response.json() as typeof forms;
    expect(data.note.fields[0]?.label).toEqual('Journal message');
  } finally {
    await responseApp.close();
  }
  expect(() => parseStepForms('kind: "StepForms"\nforms:\n  start: "invalid"')).toThrow(/Unknown step form document/);
});

test('template generators expose only executable actions for each platform', () => {
  const x = templates('x');
  const linkedIn = templates('linkedin');
  expect(x.some((plan) => plan.action === 'compose-post')).toBeTruthy();
  expect(x.some((plan) => plan.action === 'delete-post')).toBeTruthy();
  expect(!linkedIn.some((plan) => plan.action === 'compose-post')).toBeTruthy();
  expect(linkedIn.some((plan) => plan.action === 'add-project')).toBeTruthy();
  for (const plan of [...x, ...linkedIn]) {
    const verified = validatePlan(plan, plan.platform, plan.action);
    expect(verified.steps.length).toEqual(plan.steps.length);
    expect(verified.links.length).toEqual(plan.steps.length - 1);
  }
});

test('plan validates real reordered optional steps and rejects unsafe links', () => {
  const plan = defaultPlan('x', 'audit');
  const note = {
    id: 'note-1',
    kind: 'note' as const,
    title: 'Record observation',
    message: 'Review target heading',
  };
  const order = [...plan.steps];
  order.splice(3, 0, note);
  const draft = {
    ...plan,
    steps: order,
    links: order.slice(1).map((step, i) => ({
      source: order[i]!.id,
      target: step.id,
    })),
  };
  expect(validatePlan(draft, 'x', 'audit').steps[3]?.id).toEqual('note-1');
  const missing = {
    ...draft,
    steps: draft.steps.filter((s) => s.id !== 'session'),
  };
  expect(() => validatePlan(missing, 'x', 'audit')).toThrow(/connected|Required/);
  const duplicate = {
    ...draft,
    links: [...draft.links.slice(0, -1), draft.links[0]!],
  };
  expect(() => validatePlan(duplicate, 'x', 'audit')).toThrow(/Branching|connected/);
  const foreign = { ...draft, platform: 'linkedin' as const };
  expect(() => validatePlan(foreign, 'x', 'audit')).toThrow(/identity/);
  const overflow = {
    ...draft,
    steps: draft.steps.map((s) => (s.id === 'note-1' ? { ...s, message: 'x'.repeat(601) } : s)),
  };
  expect(() => validatePlan(overflow, 'x', 'audit')).toThrow(/Invalid workflow step/);
  const unsafe = {
    ...draft,
    steps: draft.steps.map((s) => (s.id === 'note-1' ? { ...s, kind: 'script' as 'note' } : s)),
  };
  expect(() => validatePlan(unsafe, 'x', 'audit')).toThrow(/Invalid workflow step/);
});

test('each validated node compiles to a deterministic, allowlisted YAML instruction', () => {
  const plan = defaultPlan('linkedin', 'edit-profile');
  const step = plan.steps.find((item) => item.id === 'inspect')!;
  step.message = 'Observe: true\n  operation: malicious-command';
  const compiled = compileWorkflow(plan);
  expect(compiled.steps.length).toEqual(6);
  expect(compiled.steps[3]?.document.spec.operation).toEqual('execute-approved-action');
  expect(compiled.steps[3]?.document.spec.policy.humanApproval).toEqual('enforced-by-provider-handler');
  expect(compiled.steps[2]?.document.spec.outputs.schema).toEqual('page-observation/v1');
  expect(compiled.yaml).toMatch(/kind: "SocialWorkflow"/);
  expect(compiled.steps[2]?.yaml ?? '').toMatch(/kind: "SocialStep"/);
  expect(compiled.steps[2]?.yaml ?? '').toMatch(/message: /);
  expect(!compiled.steps[2]?.yaml.includes('\n  operation: malicious-command\n')).toBeTruthy();
  expect(compiled.steps[2]?.yaml).toEqual(compileWorkflow(plan).steps[2]?.yaml);
  expect(compiled.steps[2]?.digest.length).toEqual(64);
  expect(!compiled.yaml.includes('postText')).toBeTruthy();
  expect(() =>
      compileWorkflow({
        ...plan,
        steps: plan.steps.map((item) =>
          item.id === 'inspect' ? { ...item, kind: 'arbitrary-shell' as 'inspect' } : item,
        ),
      })).toThrow(/Invalid workflow step/);
});

test('saved graphs, parameters and node positions survive reloading isolated workflow storage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'utomator-plan-'));
  try {
    const store = new WorkflowPlanStore(dir);
    const plan = defaultPlan('x', 'audit');
    const changed = {
      ...plan,
      parameters: { bio: 'reviewed-only' },
      steps: plan.steps.map((step) =>
        step.id === 'inspect'
          ? {
              ...step,
              title: 'Inspect verified account',
              position: { x: 670, y: 210 },
            }
          : step,
      ),
    };
    await store.save('x', 'audit', changed);
    const loaded = await new WorkflowPlanStore(dir).get('x', 'audit');
    expect(loaded.parameters?.bio).toEqual('reviewed-only');
    expect(loaded.steps.find((s) => s.id === 'inspect')?.position?.x).toEqual(670);
    expect(loaded.steps.find((s) => s.id === 'inspect')?.title).toEqual('Inspect verified account');
    const source = await readFile(join(dir, 'x-audit.json'), 'utf8');
    expect(source.includes('Inspect verified account')).toBeTruthy();
    expect(() => validatePlan({ ...changed, parameters: { secret: 'password' } }, 'x', 'audit')).toThrow(/parameters/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Fastify exposes generator and saved defaults; malformed graph never starts a browser run', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const list = await app.inject('/workflow-templates/x');
    expect(list.statusCode).toEqual(200);
    expect(list.json().some((plan: { action: string }) => plan.action === 'pin-post')).toBeTruthy();
    const unknown = await app.inject('/workflow-templates/invalid');
    expect(unknown.statusCode).toEqual(400);
    const plan = defaultPlan('x', 'audit');
    const yaml = await app.inject('/workflow-plans/x/audit/yaml');
    expect(yaml.statusCode).toEqual(200);
    expect(yaml.body).toMatch(/kind: "SocialWorkflow"/);
    expect(yaml.headers['cache-control']).toEqual('private, no-store');
    const stepYaml = await app.inject('/workflow-plans/x/audit/steps/action/yaml');
    expect(stepYaml.statusCode).toEqual(200);
    expect(stepYaml.body).toMatch(/operation: "execute-approved-action"/);
    expect((await app.inject('/workflow-plans/x/audit/steps/unknown/yaml')).statusCode).toEqual(404);
    const beforeRuns = (await app.inject('/runs')).json().length;
    const bad = {
      ...plan,
      links: [...plan.links.slice(0, -1), { source: 'start', target: 'finish' }],
    };
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'flow_test',
        workflow: bad,
      },
    });
    expect(response.statusCode).toEqual(400);
    expect(response.body).toMatch(/Branching|connected/);
    expect((await app.inject('/runs')).json().length).toEqual(beforeRuns);
    expect((await app.inject({ method: 'POST', url: '/runs/no-such-run/pause' })).statusCode).toEqual(404);
    expect((await app.inject({ method: 'POST', url: '/runs/no-such-run/resume' })).statusCode).toEqual(404);
  } finally {
    await app.close();
  }
});

test('operator hold and stop nodes execute in the backend without clicking a website', async () => {
  const originalOpen = BrowserSession.prototype.open;
  const originalClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () => ({}) as Awaited<ReturnType<typeof originalOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const steps = [
      base.steps[0]!,
      base.steps[1]!,
      {
        id: 'pause-before-action',
        kind: 'pause' as const,
        title: 'Operator breakpoint',
      },
      { id: 'stop-before-action', kind: 'stop' as const, title: 'Quit safely' },
      ...base.steps.slice(2),
    ];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'flow_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    let state = '';
    for (let i = 0; i < 120; i++) {
      const current = await app.inject(`/runs/${id}`);
      state = current.json().state;
      if (state === 'paused') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toEqual('paused');
    const manifest = await app.inject(`/runs/${id}/workflow.yaml`);
    expect(manifest.statusCode).toEqual(200);
    expect(manifest.body).toMatch(/document: "pause-before-action.yaml"/);
    const pausedYaml = await app.inject(`/runs/${id}/steps/pause-before-action.yaml`);
    expect(pausedYaml.statusCode).toEqual(200);
    expect(pausedYaml.body).toMatch(/operation: "await-operator"/);
    const stoppedYaml = await app.inject(`/runs/${id}/steps/stop-before-action.yaml`);
    expect(stoppedYaml.statusCode).toEqual(200);
    expect(stoppedYaml.body).toMatch(/operation: "end-run"/);
    const diskStep = await readFile(
      join(process.cwd(), '.runtime', 'runs', id, 'stop-before-action.yaml'),
      'utf8',
    );
    expect(diskStep).toEqual(stoppedYaml.body);
    plan.steps[2]!.title = 'Changed after the run started';
    const snapshotAgain = await app.inject(`/runs/${id}/steps/pause-before-action.yaml`);
    expect(snapshotAgain.body).toMatch(/Operator breakpoint/);
    expect(!snapshotAgain.body.includes('Changed after the run started')).toBeTruthy();
    expect((await app.inject(`/runs/${id}/steps/bogus.yaml`)).statusCode).toEqual(404);
    const resumed = await app.inject({
      method: 'POST',
      url: `/runs/${id}/resume`,
    });
    expect(resumed.statusCode).toEqual(200);
    for (let i = 0; i < 120; i++) {
      state = (await app.inject(`/runs/${id}`)).json().state;
      if (state === 'cancelled' || state === 'failed' || state === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toEqual('cancelled');
    const log = await app.inject(`/runs/${id}/logs`);
    expect(log.statusCode).toEqual(200);
    expect(log.body).toMatch(/Quit safely/);
    const entries = log.json() as Array<{
      details?: { stepId?: string; stage?: string };
    }>;
    expect(!entries.some((item) => item.details?.stepId === 'action' && item.details.stage === 'started')).toBeTruthy();
  } finally {
    await app.close();
    BrowserSession.prototype.open = originalOpen;
    BrowserSession.prototype.close = originalClose;
  }
});

test('unique workflows preserve independent same-action configurations and immutable revisions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'utomator-workflows-'));
  try {
    const registry = new WorkflowRegistry(join(dir, 'workflows'), join(dir, 'legacy'));
    const left = await registry.create(
      { ...defaultPlan('x', 'compose-post'), name: 'Series A' },
      'x-series',
    );
    const right = await registry.create(
      { ...defaultPlan('x', 'compose-post'), name: 'Series B' },
      'x-engagement',
    );
    expect(left.id).not.toEqual(right.id);
    expect((await registry.list()).length).toEqual(2);
    expect((await registry.get(right.id))?.plan.name).toEqual('Series B');
    const changed = await registry.update(left.id, 1, {
      ...left.plan,
      name: 'Series A revision 2',
    });
    expect(changed.revision).toEqual(2);
    expect((await registry.get(left.id, 1))?.plan.name).toEqual('Series A');
    expect((await registry.get(left.id, 2))?.plan.name).toEqual('Series A revision 2');
    await expect((registry.update(left.id, 1, left.plan))).rejects.toThrow(/Version conflict/);
    const restarted = new WorkflowRegistry(join(dir, 'workflows'), join(dir, 'legacy'));
    expect((await restarted.get(left.id))?.plan.name).toEqual('Series A revision 2');
    expect((await restarted.get(right.id))?.plan.name).toEqual('Series B');
    await expect((registry.get('../escape'))).rejects.toThrow(/Invalid workflow identifier/);
    await expect((registry.create(left.plan, 'untrusted/path'))).rejects.toThrow(/template identifier/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('legacy platform/action workflow files import only once without modifying the originals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'utomator-workflow-migration-'));
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, 'legacy'));
    const original = { ...defaultPlan('x', 'audit'), name: 'Historical audit' };
    const bytes = JSON.stringify(original);
    await writeFile(join(dir, 'legacy', 'x-audit.json'), bytes);
    const registry = new WorkflowRegistry(join(dir, 'workflows'), join(dir, 'legacy'));
    const first = await registry.list();
    expect(first.length).toEqual(1);
    expect(first[0]?.plan.name).toEqual('Historical audit');
    expect((await new WorkflowRegistry(join(dir, 'workflows'), join(dir, 'legacy')).list()).length).toEqual(1);
    expect(await readFile(join(dir, 'legacy', 'x-audit.json'), 'utf8')).toEqual(bytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('revisioned workflow API creates separate records, rejects stale writes and runs saved definitions', async () => {
  const app = buildApp();
  const ids: string[] = [];
  try {
    await app.ready();
    const plan = defaultPlan('x', 'audit');
    const create = async (name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows',
        payload: {
          templateId: 'x-profile',
          plan: { ...plan, name },
        },
      });
      expect(response.statusCode).toEqual(201);
      const record = response.json() as { id: string; revision: number };
      ids.push(record.id);
      return record;
    };
    const a = await create('Audit A'),
      b = await create('Audit B');
    expect(a.id).not.toEqual(b.id);
    expect((await app.inject(`/workflows/${a.id}`)).json().plan.name).toEqual('Audit A');
    expect((await app.inject(`/workflows/${b.id}`)).json().plan.name).toEqual('Audit B');
    const yaml = await app.inject(`/workflows/${a.id}/yaml`);
    expect(yaml.statusCode).toEqual(200);
    expect(yaml.body).toMatch(/kind: "SocialWorkflow"/);
    const update = await app.inject({
      method: 'PUT',
      url: `/workflows/${a.id}`,
      payload: {
        expectedRevision: 1,
        plan: { ...plan, name: 'Audit A edited' },
      },
    });
    expect(update.statusCode).toEqual(200);
    expect(update.json().revision).toEqual(2);
    expect((await app.inject(`/workflows/${a.id}/revisions/1`)).json().plan.name).toEqual('Audit A');
    const stale = await app.inject({
      method: 'PUT',
      url: `/workflows/${a.id}`,
      payload: {
        expectedRevision: 1,
        plan,
      },
    });
    expect(stale.statusCode).toEqual(409);
    const invalid = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'linkedin',
        action: 'audit',
        handle: 'flow_test',
        workflowId: a.id,
        workflowRevision: 1,
      },
    });
    expect(invalid.statusCode).toEqual(400);
    const missing = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'flow_test',
        workflowId: a.id,
        workflowRevision: 999,
      },
    });
    expect(missing.statusCode).toEqual(404);
  } finally {
    await app.close();
    for (const id of ids) {
      await rm(join(process.cwd(), '.runtime', 'workflows', `${id}.json`), {
        force: true,
      });
      await rm(join(process.cwd(), '.runtime', 'workflows', 'revisions', id), {
        recursive: true,
        force: true,
      });
    }
  }
});

test('typed note binding compiles from a preceding browser observation and rejects invalid references', () => {
  const initial = defaultPlan('x', 'audit');
  const note = {
    id: 'note-observation',
    kind: 'note' as const,
    title: 'Record observed URL',
    inputBindings: { message: { stepId: 'inspect', field: 'url' as const } },
  };
  const steps = [...initial.steps.slice(0, 3), note, ...initial.steps.slice(3)];
  const plan = {
    ...initial,
    steps,
    links: steps.slice(1).map((step, i) => ({
      source: steps[i]!.id,
      target: step.id,
    })),
  };
  const compiled = compileWorkflow(plan);
  const result = compiled.steps.find((step) => step.source.id === 'note-observation')!;
  expect(result.document.spec.inputs.bindings?.message.stepId).toEqual('inspect');
  expect(result.document.spec.inputs.bindings?.message.schema).toEqual('page-observation/v1');
  expect(result.yaml).toMatch(/bindings:\n {6}message:\n {8}stepId: "inspect"/);
  const missing = {
    ...plan,
    steps: steps.map((step) =>
      step.id === note.id
        ? {
            ...step,
            inputBindings: {
              message: { stepId: 'unknown', field: 'url' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(missing)).toThrow(/earlier page observation/);
  const future = {
    ...plan,
    steps: steps.map((step) =>
      step.id === note.id
        ? {
            ...step,
            inputBindings: {
              message: { stepId: 'verify', field: 'excerpt' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(future)).toThrow(/earlier page observation/);
  const unsupported = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'action'
        ? {
            ...step,
            inputBindings: {
              message: { stepId: 'inspect', field: 'url' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(unsupported)).toThrow(/Unsupported workflow input binding/);
});

test('a run binds live observed data to a later note and stores immutable typed step outputs', async () => {
  const originalOpen = BrowserSession.prototype.open;
  const originalClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/flow_test',
      locator: () => ({
        innerText: async () => 'Observed account profile with a public bio.',
      }),
    }) as unknown as Awaited<ReturnType<typeof originalOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const note = {
      id: 'note-excerpt',
      kind: 'note' as const,
      title: 'Record inspected page',
      inputBindings: {
        message: { stepId: 'inspect', field: 'excerpt' as const },
      },
    };
    const stop = {
      id: 'stop-action',
      kind: 'stop' as const,
      title: 'Stop before provider action',
    };
    const steps = [...base.steps.slice(0, 3), note, stop, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'flow_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    let state = '';
    for (let i = 0; i < 120; i++) {
      state = (await app.inject(`/runs/${id}`)).json().state;
      if (['cancelled', 'failed', 'completed'].includes(state)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toEqual('cancelled');
    const observation = await app.inject(`/runs/${id}/steps/inspect/output`);
    expect(observation.statusCode).toEqual(200);
    expect(observation.json()).toEqual({
      stepId: 'inspect',
      schema: 'page-observation/v1',
      url: 'https://x.com/flow_test',
      excerpt: 'Observed account profile with a public bio.',
    });
    const noteOutput = await app.inject(`/runs/${id}/steps/note-excerpt/output`);
    expect(noteOutput.statusCode).toEqual(200);
    expect(noteOutput.json().schema).toEqual('status/v1');
    expect((await app.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
    const journal = await app.inject(`/runs/${id}/logs`);
    expect(journal
        .json()
        .some(
          (event: { message: string; details?: { stepId?: string } }) =>
            event.message === 'Observed account profile with a public bio.' &&
            event.details?.stepId === 'note-excerpt',
        )).toBeTruthy();
    const persisted = await readFile(
      join(process.cwd(), '.runtime', 'runs', id, 'inspect.output.json'),
      'utf8',
    );
    expect(JSON.parse(persisted).excerpt).toEqual(observation.json().excerpt);
    expect((await app.inject(`/runs/${id}/steps/note-excerpt.yaml`)).body).toMatch(/schema: "page-observation\/v1"/);
  } finally {
    await app.close();
    BrowserSession.prototype.open = originalOpen;
    BrowserSession.prototype.close = originalClose;
  }
});

test('archived runs survive a new app instance with recorded YAML and typed outputs', async () => {
  const originalOpen = BrowserSession.prototype.open;
  const originalClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/archive_test',
      locator: () => ({
        innerText: async () => 'Archived actual browser observation.',
      }),
    }) as unknown as Awaited<ReturnType<typeof originalOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  let id = '';
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const stop = {
      id: 'stop-archive',
      kind: 'stop' as const,
      title: 'Stop safely before provider',
    };
    const steps = [...base.steps.slice(0, 3), stop, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'archive_test',
        workflow: plan,
      },
    });
    expect(response.statusCode).toEqual(202);
    id = response.json().id as string;
    for (let n = 0; n < 120; n++) {
      const state = (await app.inject(`/runs/${id}`)).json().state;
      if (state === 'cancelled') break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect((await app.inject(`/runs/${id}`)).json().state).toEqual('cancelled');
  } finally {
    await app.close();
    BrowserSession.prototype.open = originalOpen;
    BrowserSession.prototype.close = originalClose;
  }
  expect(id).toBeTruthy();
  const restarted = buildApp();
  try {
    await restarted.ready();
    const restored = await restarted.inject(`/runs/${id}`);
    expect(restored.statusCode).toEqual(200);
    expect(restored.json().state).toEqual('cancelled');
    expect((await restarted.inject('/runs')).json().some((item: { id: string }) => item.id === id)).toBeTruthy();
    const yaml = await restarted.inject(`/runs/${id}/workflow.yaml`);
    expect(yaml.statusCode).toEqual(200);
    const output = await restarted.inject(`/runs/${id}/steps/inspect/output`);
    expect(output.statusCode).toEqual(200);
    expect(output.json().excerpt).toEqual('Archived actual browser observation.');
    expect((await restarted.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
    expect((await restarted.inject(`/runs/${id}/logs`)).statusCode).toEqual(200);
    expect((await restarted.inject(`/runs/${id}/assessment`)).statusCode).toEqual(409);
  } finally {
    await restarted.close();
  }
});

test('run archive marks interrupted sessions failed without reopening a browser', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'utomator-archive-'));
  try {
    const id = 'acd3e11a-a7c6-4b5e-809e-23d96d6d7742';
    const archive = new RunArchive(dir);
    archive.save(
      {
        id,
        platform: 'x',
        action: 'audit',
        state: 'approval-needed',
        createdAt: '2026-10-26T09:00:00.000Z',
        checkpoint: { id: 'not-persisted', message: 'Temporary approval' },
      },
      ['start', 'finish'],
    );
    const restarted = new RunArchive(dir);
    const restored = restarted.restore();
    expect(restored[0]?.summary.state).toEqual('failed');
    expect(restored[0]?.summary.error ?? '').toMatch(/interrupted by an automation engine restart/);
    expect(restored[0]?.summary.checkpoint).toEqual(undefined);
    expect(restarted.readArtifact(id, '../escape')).toEqual(null);
    expect(restarted.readArtifact(id, 'action')).toEqual(null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('authored YAML is immutable, schema validated, and only selects allowlisted operations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'utomator-yaml-def-'));
  const yaml = (id: string, version: number) =>
    `${[
      'apiVersion: "utomator.dev/v1"',
      'kind: "StepDefinition"',
      'metadata:',
      `  id: "${id}"`,
      `  version: ${version}`,
      '  title: "Evidence note"',
      'spec:',
      '  stepKind: "note"',
      '  operation: "record-event"',
      '  outputs: "status/v1"',
      '  config:',
      '    message: "Grounded local note"',
    ].join('\n')}\n`;
  try {
    const store = new StepDefinitionStore(dir);
    const id = 'noteTest';
    expect(parseStepDefinition(yaml(id, 1)).spec.operation).toEqual('record-event');
    await store.create(yaml(id, 1));
    await store.create(yaml(id, 2));
    await expect((store.create(yaml(id, 1)))).rejects.toThrow(/EEXIST/);
    expect((await store.get(id, 1))?.metadata.version).toEqual(1);
    expect((await store.list()).length).toEqual(2);
    expect(() =>
        parseStepDefinition(
          yaml(id, 1).replace('operation: "record-event"', 'operation: "execute-shell"'),
        )).toThrow(/Unregistered/);
    expect(() => parseStepDefinition(yaml(id, 1).replace('  version: 1', '  version: 1\n  version: 2'))).toThrow(/Duplicate YAML/);
    expect(() => parseStepDefinition(yaml(id, 1).replace('  id: "noteTest"', '  id: ../../escape'))).toThrow(/YAML scalar/);
    expect(() =>
        parseStepDefinition(
          yaml(id, 1).replace('  outputs: "status/v1"', '  outputs: "action-event/v1"'),
        )).toThrow(/Unregistered/);
    expect(() => parseStepDefinition(`${yaml(id, 1)}  command: "bad"\n`)).toThrow(/Invalid YAML spec schema/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('typed bindings accept earlier note messages and numeric delay durations, but reject unsafe targets', () => {
  const base = defaultPlan('x', 'audit');
  const inspectNote = {
    id: 'note-observe',
    kind: 'note' as const,
    title: 'Note observed excerpt',
    inputBindings: {
      message: { stepId: 'inspect', field: 'excerpt' as const },
    },
  };
  const relay = {
    id: 'note-relay',
    kind: 'note' as const,
    title: 'Relay note',
    inputBindings: {
      message: { stepId: 'note-observe', field: 'message' as const },
    },
  };
  const delay1 = {
    id: 'delay-one',
    kind: 'delay' as const,
    title: 'Short delay',
    delayMs: 10,
  };
  const delay2 = {
    id: 'delay-two',
    kind: 'delay' as const,
    title: 'Reuse duration',
    inputBindings: {
      delayMs: { stepId: 'delay-one', field: 'durationMs' as const },
    },
  };
  const steps = [...base.steps.slice(0, 3), inspectNote, relay, delay1, delay2, ...base.steps.slice(3)];
  const plan = {
    ...base,
    steps,
    links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
  const compiled = compileWorkflow(plan);
  expect(compiled.steps.find((step) => step.source.id === 'note-relay')?.document.spec.inputs.bindings
      ?.message?.schema).toEqual('status/v1');
  expect(compiled.steps.find((step) => step.source.id === 'delay-two')?.document.spec.inputs.bindings?.delayMs
      ?.schema).toEqual('status/v1');
  expect(compiled.steps.find((step) => step.source.id === 'delay-two')?.yaml ?? '').toMatch(/durationMs/);
  const wrong = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'delay-two'
        ? {
            ...step,
            inputBindings: {
              delayMs: { stepId: 'note-observe', field: 'message' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(wrong)).toThrow(/type mismatch/);
  const future = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'note-observe'
        ? {
            ...step,
            inputBindings: {
              message: { stepId: 'note-relay', field: 'message' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(future)).toThrow(/earlier/);
  const unsafe = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'action'
        ? {
            ...step,
            inputBindings: {
              message: { stepId: 'inspect', field: 'url' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(unsafe)).toThrow(/Unsupported workflow input binding/);
});

test('saved YAML step definitions execute with pinned versions and expose step outputs without provider mutation', async () => {
  const id = `note${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const yaml = `${[
    'apiVersion: "utomator.dev/v1"',
    'kind: "StepDefinition"',
    'metadata:',
    `  id: "${id}"`,
    '  version: 1',
    '  title: "Standalone authored note"',
    'spec:',
    '  stepKind: "note"',
    '  operation: "record-event"',
    '  outputs: "status/v1"',
    '  config:',
    '    message: "Verified authored instruction"',
  ].join('\n')}\n`;
  let savedWorkflowId = '';
  const originalOpen = BrowserSession.prototype.open,
    originalClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/authored_test',
      locator: () => ({ innerText: async () => 'Verified remote page data' }),
    }) as unknown as Awaited<ReturnType<typeof originalOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const created = await app.inject({
      method: 'POST',
      url: '/step-definitions',
      payload: { yaml },
    });
    expect(created.statusCode).toEqual(201);
    expect((
        await app.inject({
          method: 'POST',
          url: '/step-definitions',
          payload: { yaml },
        })
      ).statusCode).toEqual(409);
    expect((await app.inject(`/step-definitions/${id}/versions/1`)).statusCode).toEqual(200);
    const base = defaultPlan('x', 'audit');
    const note = {
      id: 'note-authored',
      kind: 'note' as const,
      title: 'Authored note',
      definition: { id, version: 1 },
    };
    const stop = {
      id: 'stop-provider',
      kind: 'stop' as const,
      title: 'Stop before provider',
    };
    const steps = [...base.steps.slice(0, 3), note, stop, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
    };
    const createdWorkflow = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { plan },
    });
    expect(createdWorkflow.statusCode).toEqual(201);
    const record = createdWorkflow.json() as { id: string; revision: number };
    savedWorkflowId = record.id;
    expect((await app.inject(`/workflows/${record.id}/yaml`)).body).toMatch(/note-authored/);
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'authored_test',
        workflowId: record.id,
        workflowRevision: 1,
      },
    });
    expect(started.statusCode).toEqual(202);
    const runId = started.json().id as string;
    for (let i = 0; i < 120; i++) {
      const state = (await app.inject(`/runs/${runId}`)).json().state;
      if (['cancelled', 'failed', 'completed'].includes(state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect((await app.inject(`/runs/${runId}`)).json().state).toEqual('cancelled');
    const output = await app.inject(`/runs/${runId}/steps/note-authored/output`);
    expect(output.statusCode).toEqual(200);
    expect(output.json().message).toEqual('Verified authored instruction');
    expect((await app.inject(`/runs/${runId}/steps/note-authored.yaml`)).body).toMatch(/definitionId/);
    expect((await app.inject(`/runs/${runId}/steps/action/output`)).statusCode).toEqual(404);
  } finally {
    await app.close();
    BrowserSession.prototype.open = originalOpen;
    BrowserSession.prototype.close = originalClose;
    await rm(join(process.cwd(), '.runtime', 'step-definitions', id), {
      recursive: true,
      force: true,
    });
    if (savedWorkflowId) {
      await rm(join(process.cwd(), '.runtime', 'workflows', `${savedWorkflowId}.json`), { force: true });
      await rm(join(process.cwd(), '.runtime', 'workflows', 'revisions', savedWorkflowId), {
        recursive: true,
        force: true,
      });
    }
  }
});

test('typed note-to-note and number-to-delay handoffs execute before a guarded provider stop', async () => {
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/typed_test',
      locator: () => ({ innerText: async () => 'Typed browser observation' }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const sequence = [
      {
        id: 'note-first',
        kind: 'note' as const,
        title: 'Read excerpt',
        inputBindings: {
          message: { stepId: 'inspect', field: 'excerpt' as const },
        },
      },
      {
        id: 'note-second',
        kind: 'note' as const,
        title: 'Reuse first note',
        inputBindings: {
          message: { stepId: 'note-first', field: 'message' as const },
        },
      },
      {
        id: 'delay-first',
        kind: 'delay' as const,
        title: 'Initial delay',
        delayMs: 1,
      },
      {
        id: 'delay-second',
        kind: 'delay' as const,
        title: 'Reuse delay duration',
        inputBindings: {
          delayMs: { stepId: 'delay-first', field: 'durationMs' as const },
        },
      },
      {
        id: 'stop-before-action',
        kind: 'stop' as const,
        title: 'Terminate before browser mutation',
      },
    ];
    const steps = [...base.steps.slice(0, 3), ...sequence, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((item, i) => ({ source: steps[i]!.id, target: item.id })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'typed_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    let state = '';
    for (let i = 0; i < 120; i++) {
      state = (await app.inject(`/runs/${id}`)).json().state;
      if (['failed', 'cancelled', 'completed'].includes(state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(state).toEqual('cancelled');
    expect((await app.inject(`/runs/${id}/steps/note-second/output`)).json().message).toEqual('Typed browser observation');
    expect((await app.inject(`/runs/${id}/steps/delay-second/output`)).json().durationMs).toEqual(1);
    expect((await app.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
  }
});

test('authored assessment definitions enforce a reviewed output contract', () => {
  const yaml = `${[
    'apiVersion: "utomator.dev/v1"',
    'kind: "StepDefinition"',
    'metadata:',
    '  id: "assessmentExample"',
    '  version: 1',
    '  title: "Check observed profile text"',
    'spec:',
    '  stepKind: "assess"',
    '  operation: "assess-observation"',
    '  outputs: "assessment/v1"',
    '  config:',
    '    expectedText: "public"',
  ].join('\n')}\n`;
  const parsed = parseStepDefinition(yaml);
  expect(parsed.spec.config.expectedText).toEqual('public');
  expect(parsed.spec.outputs).toEqual('assessment/v1');
  expect(() => parseStepDefinition(yaml.replace('assess-observation', 'execute-approved-action'))).toThrow(/Unregistered/);
  expect(() => parseStepDefinition(yaml.replace('assessment/v1', 'status/v1'))).toThrow(/Unregistered/);
  expect(() => parseStepDefinition(yaml.replace('expectedText: "public"', 'expectedText: " "'))).toThrow(/expectation/);
  expect(() => parseStepDefinition(yaml.replace('    expectedText: "public"', '    script: "rm -rf"'))).toThrow(/schema/);
});

test('typed assessment dataflow compiles across string and boolean outputs without provider bindings', () => {
  const base = defaultPlan('x', 'audit');
  const assess = {
    id: 'assessment',
    kind: 'assess' as const,
    title: 'Check profile text',
    expectedText: 'public',
    inputBindings: { text: { stepId: 'inspect', field: 'excerpt' as const } },
  };
  const recheck = {
    id: 'assessment-again',
    kind: 'assess' as const,
    title: 'Check assessment consistency',
    expectedText: 'Assessment',
    inputBindings: {
      text: { stepId: 'assessment', field: 'summary' as const },
      expectedMatch: { stepId: 'assessment', field: 'matched' as const },
    },
  };
  const note = {
    id: 'assessment-note',
    kind: 'note' as const,
    title: 'Record assessment',
    inputBindings: {
      message: { stepId: 'assessment-again', field: 'summary' as const },
    },
  };
  const steps = [...base.steps.slice(0, 3), assess, recheck, note, ...base.steps.slice(3)];
  const plan = {
    ...base,
    steps,
    links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
  const compiled = compileWorkflow(plan);
  expect(compiled.steps.find((s) => s.source.id === 'assessment')?.document.spec.outputs.schema).toEqual('assessment/v1');
  expect(compiled.steps.find((s) => s.source.id === 'assessment-again')?.document.spec.inputs.bindings
      ?.expectedMatch?.schema).toEqual('assessment/v1');
  expect(compiled.steps.find((s) => s.source.id === 'assessment-note')?.document.spec.inputs.bindings?.message
      ?.schema).toEqual('assessment/v1');
  const wrong = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'assessment-again'
        ? {
            ...step,
            inputBindings: {
              text: { stepId: 'assessment', field: 'matched' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(wrong)).toThrow(/type mismatch/);
  const future = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'assessment'
        ? {
            ...step,
            inputBindings: {
              text: { stepId: 'assessment-again', field: 'summary' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(future)).toThrow(/earlier/);
  const unsafe = {
    ...plan,
    steps: steps.map((step) =>
      step.id === 'action'
        ? {
            ...step,
            inputBindings: {
              text: { stepId: 'assessment', field: 'summary' as const },
            },
          }
        : step,
    ),
  };
  expect(() => compileWorkflow(unsafe)).toThrow(/Unsupported workflow input binding/);
  const missing = {
    ...plan,
    steps: steps.map((step) => (step.id === 'assessment' ? { ...step, expectedText: undefined } : step)),
  };
  expect(() => compileWorkflow(missing)).toThrow(/Assessment requires/);
});

test('authored observation assessments produce immutable typed outputs before guarded provider actions', async () => {
  const authoredId = `assessment${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const yaml = `${[
    'apiVersion: "utomator.dev/v1"',
    'kind: "StepDefinition"',
    'metadata:',
    `  id: "${authoredId}"`,
    '  version: 1',
    '  title: "Read-only observation assessment"',
    'spec:',
    '  stepKind: "assess"',
    '  operation: "assess-observation"',
    '  outputs: "assessment/v1"',
    '  config:',
    '    expectedText: "public"',
  ].join('\n')}\n`;
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/assess_test',
      locator: () => ({ innerText: async () => 'Observed public account bio' }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  let workflowId = '';
  try {
    await app.ready();
    expect((
        await app.inject({
          method: 'POST',
          url: '/step-definitions',
          payload: { yaml },
        })
      ).statusCode).toEqual(201);
    const base = defaultPlan('x', 'audit');
    const assess = {
      id: 'assess-authored',
      kind: 'assess' as const,
      title: 'Assess live excerpt',
      definition: { id: authoredId, version: 1 },
      inputBindings: { text: { stepId: 'inspect', field: 'excerpt' as const } },
    };
    const note = {
      id: 'note-assessment',
      kind: 'note' as const,
      title: 'Explain finding',
      inputBindings: {
        message: { stepId: 'assess-authored', field: 'summary' as const },
      },
    };
    const stop = {
      id: 'stop-mutations',
      kind: 'stop' as const,
      title: 'End before action',
    };
    const steps = [...base.steps.slice(0, 3), assess, note, stop, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
    };
    const saved = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { plan },
    });
    expect(saved.statusCode).toEqual(201);
    workflowId = saved.json().id as string;
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'assess_test',
        workflowId,
        workflowRevision: 1,
      },
    });
    expect(started.statusCode).toEqual(202);
    const runId = started.json().id as string;
    for (let i = 0; i < 120; i++) {
      const state = (await app.inject(`/runs/${runId}`)).json().state;
      if (['cancelled', 'failed', 'completed'].includes(state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect((await app.inject(`/runs/${runId}`)).json().state).toEqual('cancelled');
    const assessment = await app.inject(`/runs/${runId}/steps/assess-authored/output`);
    expect(assessment.statusCode).toEqual(200);
    expect(assessment.json()).toEqual({
      stepId: 'assess-authored',
      schema: 'assessment/v1',
      matched: true,
      summary: 'Assessment matched the declared observation text',
    });
    const noteResult = await app.inject(`/runs/${runId}/steps/note-assessment/output`);
    expect(noteResult.statusCode).toEqual(200);
    expect(noteResult.json().message).toEqual(assessment.json().summary);
    expect((await app.inject(`/runs/${runId}/steps/action/output`)).statusCode).toEqual(404);
    expect((await app.inject(`/runs/${runId}/steps/assess-authored.yaml`)).body).toMatch(/assessment\/v1/);
    const bytes = await readFile(
      join(process.cwd(), '.runtime', 'runs', runId, 'assess-authored.output.json'),
      'utf8',
    );
    expect(JSON.parse(bytes).matched).toEqual(true);
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
    await rm(join(process.cwd(), '.runtime', 'step-definitions', authoredId), {
      recursive: true,
      force: true,
    });
    if (workflowId) {
      await rm(join(process.cwd(), '.runtime', 'workflows', `${workflowId}.json`), { force: true });
      await rm(join(process.cwd(), '.runtime', 'workflows', 'revisions', workflowId), {
        recursive: true,
        force: true,
      });
    }
  }
});

test('evidence and approval steps compile only with prior provenance-bound typed sources', () => {
  const base = defaultPlan('x', 'audit');
  const evidence = {
    id: 'evidence',
    kind: 'evidence' as const,
    title: 'Capture observed source',
    inputBindings: {
      observation: { stepId: 'inspect', field: 'excerpt' as const },
    },
  };
  const approval = {
    id: 'approval-review',
    kind: 'approve' as const,
    title: 'Review evidence',
    inputBindings: {
      evidence: { stepId: 'evidence', field: 'digest' as const },
    },
  };
  const steps = [...base.steps.slice(0, 3), evidence, approval, ...base.steps.slice(3)];
  const plan = {
    ...base,
    steps,
    links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
  const compiled = compileWorkflow(plan);
  expect(compiled.steps.find((s) => s.source.id === 'evidence')?.document.spec.outputs.schema).toEqual('evidence/v1');
  expect(compiled.steps.find((s) => s.source.id === 'approval-review')?.document.spec.policy.humanApproval).toEqual('required-at-evidence-step');
  expect(compiled.steps.find((s) => s.source.id === 'approval-review')?.yaml ?? '').toMatch(/require-evidence-approval/);
  const invalid = {
    ...plan,
    steps: steps.map((item) =>
      item.id === 'approval-review'
        ? {
            ...item,
            inputBindings: {
              evidence: { stepId: 'inspect', field: 'excerpt' as const },
            },
          }
        : item,
    ),
  };
  expect(() => compileWorkflow(invalid)).toThrow(/Approval must reference an earlier evidence digest/);
  const future = {
    ...plan,
    steps: steps.map((item) =>
      item.id === 'evidence'
        ? {
            ...item,
            inputBindings: {
              observation: { stepId: 'verify', field: 'excerpt' as const },
            },
          }
        : item,
    ),
  };
  expect(() => compileWorkflow(future)).toThrow(/earlier/);
  const unbound = {
    ...plan,
    steps: steps.map((item) =>
      item.id === 'approval-review' ? { ...item, inputBindings: undefined } : item,
    ),
  };
  expect(() => compileWorkflow(unbound)).toThrow(/Approval step requires/);
  expect(() =>
      compileWorkflow({
        ...plan,
        steps: steps.map((item) =>
          item.id === 'action'
            ? {
                ...item,
                inputBindings: {
                  evidence: { stepId: 'evidence', field: 'digest' as const },
                },
              }
            : item,
        ),
      })).toThrow(/Unsupported workflow input binding/);
});

test('approval of immutable observed evidence is a real checkpoint and does not execute later provider steps', async () => {
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/evidence_test',
      locator: () => ({
        innerText: async () => 'Public, observed profile text',
      }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const extra = [
      {
        id: 'evidence-capture',
        kind: 'evidence' as const,
        title: 'Snapshot page evidence',
        inputBindings: {
          observation: { stepId: 'inspect', field: 'excerpt' as const },
        },
      },
      {
        id: 'approve-evidence',
        kind: 'approve' as const,
        title: 'Review observed evidence',
        inputBindings: {
          evidence: { stepId: 'evidence-capture', field: 'digest' as const },
        },
      },
      {
        id: 'stop-before-provider',
        kind: 'stop' as const,
        title: 'No external action',
      },
    ];
    const steps = [...base.steps.slice(0, 3), ...extra, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'evidence_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    let checkpointId = '';
    for (let i = 0; i < 160; i++) {
      const run = (await app.inject(`/runs/${id}`)).json() as {
        state: string;
        checkpoint?: { id: string };
      };
      if (run.state === 'approval-needed') {
        checkpointId = run.checkpoint?.id ?? '';
        break;
      }
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(checkpointId).toBeTruthy();
    const evidence = (await app.inject(`/runs/${id}/steps/evidence-capture/output`)).json() as {
      schema: string;
      sourceStepId: string;
      sourceSchema: string;
      url: string;
      digest: string;
    };
    expect(evidence.schema).toEqual('evidence/v1');
    expect(evidence.sourceStepId).toEqual('inspect');
    expect(evidence.sourceSchema).toEqual('page-observation/v1');
    expect(evidence.digest.length).toEqual(64);
    expect((await app.inject(`/runs/${id}/steps/approve-evidence/output`)).statusCode).toEqual(404);
    const response = await app.inject({
      method: 'POST',
      url: `/runs/${id}/decision`,
      payload: { checkpointId, approved: true },
    });
    expect(response.statusCode).toEqual(200);
    for (let i = 0; i < 160; i++) {
      const run = (await app.inject(`/runs/${id}`)).json() as { state: string };
      if (['cancelled', 'blocked', 'failed'].includes(run.state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect((await app.inject(`/runs/${id}`)).json().state).toEqual('cancelled');
    const approval = (await app.inject(`/runs/${id}/steps/approve-evidence/output`)).json();
    expect(approval).toEqual({
      stepId: 'approve-evidence',
      schema: 'approval/v1',
      approved: true,
      evidenceStepId: 'inspect',
      evidenceDigest: evidence.digest,
    });
    expect((await app.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
    expect(await readFile(
        join(process.cwd(), '.runtime', 'runs', id, 'approve-evidence.output.json'),
        'utf8',
      )).toMatch(/evidenceDigest/);
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
  }
});

test('rejecting an evidence approval blocks the run and leaves no approved output', async () => {
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://x.com/rejection_test',
      locator: () => ({ innerText: async () => 'Observed text for review' }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const extra = [
      {
        id: 'evidence-check',
        kind: 'evidence' as const,
        title: 'Save observation',
        inputBindings: {
          observation: { stepId: 'inspect', field: 'excerpt' as const },
        },
      },
      {
        id: 'approval-check',
        kind: 'approve' as const,
        title: 'Human approval',
        inputBindings: {
          evidence: { stepId: 'evidence-check', field: 'digest' as const },
        },
      },
      { id: 'stop-check', kind: 'stop' as const, title: 'Stop before action' },
    ];
    const steps = [...base.steps.slice(0, 3), ...extra, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'rejection_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    let checkpoint = '';
    for (let i = 0; i < 160; i++) {
      const run = (await app.inject(`/runs/${id}`)).json() as {
        state: string;
        checkpoint?: { id: string };
      };
      if (run.state === 'approval-needed') {
        checkpoint = run.checkpoint?.id ?? '';
        break;
      }
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(checkpoint).toBeTruthy();
    const denied = await app.inject({
      method: 'POST',
      url: `/runs/${id}/decision`,
      payload: { checkpointId: checkpoint, approved: false },
    });
    expect(denied.statusCode).toEqual(200);
    for (let i = 0; i < 160; i++) {
      const state = (await app.inject(`/runs/${id}`)).json().state;
      if (['blocked', 'failed', 'cancelled'].includes(state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect((await app.inject(`/runs/${id}`)).json().state).toEqual('blocked');
    expect((await app.inject(`/runs/${id}/steps/approval-check/output`)).statusCode).toEqual(404);
    expect((await app.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
    expect((
        await app.inject({
          method: 'POST',
          url: `/runs/${id}/decision`,
          payload: { checkpointId: checkpoint, approved: true },
        })
      ).statusCode).toEqual(409);
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
  }
});

test('evidence capture rejects an off-profile redirect before any approval', async () => {
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async () => undefined,
      url: () => 'https://external.example/redirected',
      locator: () => ({
        innerText: async () => 'Untrusted redirected content',
      }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const app = buildApp();
  try {
    await app.ready();
    const base = defaultPlan('x', 'audit');
    const evidence = {
      id: 'verify-origin',
      kind: 'evidence' as const,
      title: 'Verify scoped evidence',
      inputBindings: {
        observation: { stepId: 'inspect', field: 'excerpt' as const },
      },
    };
    const steps = [...base.steps.slice(0, 3), evidence, ...base.steps.slice(3)];
    const plan = {
      ...base,
      steps,
      links: steps.slice(1).map((step, i) => ({
        source: steps[i]!.id,
        target: step.id,
      })),
    };
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'x',
        action: 'audit',
        handle: 'origin_test',
        workflow: plan,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = started.json().id as string;
    for (let i = 0; i < 160; i++) {
      const state = (await app.inject(`/runs/${id}`)).json().state;
      if (['failed', 'blocked', 'cancelled', 'completed'].includes(state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    const final = (await app.inject(`/runs/${id}`)).json() as {
      state: string;
      error: string;
    };
    expect(final.state).toEqual('failed');
    expect(final.error).toMatch(/outside the exact authorized profile scope/);
    expect((await app.inject(`/runs/${id}/steps/verify-origin/output`)).statusCode).toEqual(404);
    expect((await app.inject(`/runs/${id}/steps/action/output`)).statusCode).toEqual(404);
    const journal = (await app.inject(`/runs/${id}/logs`)).json() as Array<{
      kind: string;
      details?: { stepId?: string; stage?: string };
    }>;
    expect(journal.some(
        (event) =>
          event.kind === 'step' &&
          event.details?.stepId === 'verify-origin' &&
          event.details?.stage === 'failed',
      )).toBeTruthy();
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
  }
});

test('LinkedIn templates compile into owner-approved evidence and read-back pipelines', async () => {
  const plans = templates('linkedin');
  expect(plans.length).toEqual(9);
  expect(new Set(plans.map((plan) => plan.name)).size).toEqual(9);
  for (const plan of plans) {
    const validated = validatePlan(plan, 'linkedin', plan.action);
    const compiled = compileWorkflow(validated);
    expect(compiled.steps.length).toEqual(plan.steps.length);
    expect(plan.steps.filter((step) => step.kind === 'action').length).toEqual(1);
    expect(plan.steps.some((step) => step.kind === 'pause')).toEqual(true);
    expect(plan.steps.some((step) => step.kind === 'verify')).toEqual(true);
    expect(plan.steps.some((step) => step.kind === 'evidence')).toEqual(true);
    expect(plan.steps.some((step) => step.kind === 'approve')).toEqual(true);
    for (const step of compiled.steps) {
      expect(step.document.spec.inputs.scope).toEqual('current-run');
      expect(step.document.spec.outputs.schema).toBeTruthy();
      expect(step.yaml.startsWith('apiVersion: "utomator.dev/v1"')).toBeTruthy();
    }
  }
  const selected = plans.find((plan) => plan.action === 'audit-page')!;
  expect(selected.steps.find((step) => step.kind === 'evidence')?.inputBindings?.observation?.stepId).toEqual('verify');
  const mutation = plans.find((plan) => plan.action === 'edit-profile')!;
  expect(mutation.steps.find((step) => step.kind === 'evidence')?.inputBindings?.observation?.stepId).toEqual('inspect');
  const store = new WorkflowPlanStore(join(tmpdir(), `missing-linkedin-fixture-${randomUUID()}`));
  const loaded = await store.get('linkedin', 'edit-profile');
  expect(loaded.steps.length).toEqual(11);
  expect(loaded.steps.find((step) => step.id === 'action')?.title).toEqual('Revise approved headline or About');
});

test('LinkedIn template can be saved while disconnected, but execution requires the selected synced account', async () => {
  const app = buildApp();
  let id: string | undefined;
  try {
    await app.ready();
    const all = await app.inject('/workflow-templates/linkedin');
    expect(all.statusCode).toEqual(200);
    const plan = (all.json() as ReturnType<typeof templates>).find((item) => item.action === 'audit');
    expect(plan).toBeTruthy();
    const saved = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { plan, templateId: 'li-audit' },
    });
    expect(saved.statusCode).toEqual(201);
    id = (saved.json() as { id: string }).id;
    const before = (await app.inject('/runs')).json().length;
    const handleOnly = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'linkedin',
        action: 'audit',
        handle: 'not-a-linked-in-session',
        workflowId: id,
        workflowRevision: 1,
      },
    });
    expect(handleOnly.statusCode).toEqual(400);
    expect(handleOnly.body).toMatch(/connect.*sync/);
    const noAccount = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'linkedin',
        action: 'audit',
        handle: 'not-a-linked-in-session',
        workflow: plan,
      },
    });
    expect(noAccount.statusCode).toEqual(400);
    const unverified = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'linkedin',
        action: 'audit',
        accountId: randomUUID(),
        workflowId: id,
        workflowRevision: 1,
      },
    });
    expect(unverified.statusCode).toEqual(400);
    expect(unverified.body).toMatch(/not found|not verified/i);
    expect((await app.inject('/runs')).json().length).toEqual(before);
    const exists = await app.inject(`/workflows/${id}`);
    expect(exists.statusCode).toEqual(200);
  } finally {
    await app.close();
    if (id) {
      await rm(join(process.cwd(), '.runtime', 'workflows', `${id}.json`), {
        force: true,
      });
      await rm(join(process.cwd(), '.runtime', 'workflows', 'revisions', id), {
        recursive: true,
        force: true,
      });
    }
  }
});

test('every LinkedIn run revalidates the saved browser session and flags authentication stage failures', async () => {
  const oldOpen = BrowserSession.prototype.open,
    oldClose = BrowserSession.prototype.close;
  let currentUrl = 'https://www.linkedin.com/in/verified-owner/';
  let signedIn = true;
  BrowserSession.prototype.open = async () =>
    ({
      goto: async (url: string) => {
        currentUrl = url;
        return null;
      },
      url: () => currentUrl,
      getByRole: () => ({
        first: () => ({
          waitFor: async () => {
            if (!signedIn) throw Error('Sign-in required');
          },
        }),
      }),
      locator: () => ({ innerText: async () => 'Profile verified before run' }),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  BrowserSession.prototype.close = async () => {};
  const root = await mkdtemp(join(tmpdir(), 'utomator-linkedin-reauth-'));
  const app = buildApp({ socialWorkspaceRoot: root });
  try {
    await app.ready();
    const seeded = await new AccountStore(root).addSocial(0, {
      platform: 'linkedin',
      label: 'Verified owner',
      handle: 'verified-owner',
      profileUrl: 'https://www.linkedin.com/in/verified-owner/',
    });
    const account = seeded.socialAccounts[0]!;
    expect((
        await app.inject({
          method: 'POST',
          url: `/connectors/${account.id}/connect`,
        })
      ).statusCode).toEqual(200);
    expect((
        await app.inject({
          method: 'POST',
          url: `/connectors/${account.id}/sync`,
        })
      ).json().status).toEqual('connected');
    signedIn = false; // The provider revoked the session after the earlier sync.
    const started = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        platform: 'linkedin',
        action: 'audit',
        accountId: account.id,
      },
    });
    expect(started.statusCode).toEqual(202);
    const id = (started.json() as { id: string }).id;
    for (let i = 0; i < 180; i++) {
      const row = (await app.inject(`/runs/${id}`)).json() as { state: string };
      if (['blocked', 'failed', 'cancelled', 'completed'].includes(row.state)) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    const final = (await app.inject(`/runs/${id}`)).json() as {
      state: string;
      error: string;
    };
    expect(final.state).toEqual('blocked');
    expect(final.error).toMatch(/session not authenticated/);
    const journal = (await app.inject(`/runs/${id}/logs`)).json() as Array<{
      kind: string;
      details?: { stepId?: string; stage?: string };
    }>;
    expect(journal.some(
        (e) => e.kind === 'step' && e.details?.stepId === 'session' && e.details?.stage === 'failed',
      )).toBeTruthy();
    const refreshed = (await app.inject('/connectors')).json() as Array<{
      id: string;
      status: string;
    }>;
    expect(refreshed.find((row) => row.id === account.id)?.status).toEqual('disconnected');
  } finally {
    await app.close();
    BrowserSession.prototype.open = oldOpen;
    BrowserSession.prototype.close = oldClose;
    await rm(root, { recursive: true, force: true });
  }
});
