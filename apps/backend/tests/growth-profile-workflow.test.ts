
import { test, expect } from 'vitest';

// Set the test environment before loading the Fastify app, matching other route tests.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

import { compileGrowthProfileYaml, readGrowthProfileWorkflow } from '../src/engine/growth-profile.js';

test('Profile YAML retains nine requirements, twenty evidence targets and compiled registered actions', async () => {
  const { program } = await readGrowthProfileWorkflow();
  expect(program.id).toEqual('linkedin-profile');
  expect(program.requirements.length).toEqual(9);
  expect(program.coverage.length).toEqual(20);
  expect(program.pipelines.length).toEqual(9);
  expect(program.coverage.every((item) => item.status === 'requires-independent-evidence')).toBeTruthy();
  expect(program.pipelines.every(
      (item) =>
        item.source === 'registered-workflow-plan' &&
        item.requiresConnectedAccount &&
        item.stepCount >= 4,
    )).toBeTruthy();
});
test('Unknown operations, duplicated evidence targets and unknown YAML keys fail closed', async () => {
  const { yaml } = await readGrowthProfileWorkflow();
  expect(() => compileGrowthProfileYaml(yaml.replace('"add-featured"', '"delete-post"'))).toThrow(/missing/);
  expect(() => compileGrowthProfileYaml(yaml.replace('"Profile verification"', '"Profile photo"'))).toThrow(/missing/);
  expect(() => compileGrowthProfileYaml(yaml.replace('  objective:', '  unsupported: "yes"\n  objective:'))).toThrow(/Invalid Growth profile YAML spec/);
  expect(() => compileGrowthProfileYaml(yaml + '\nspec:\n')).toThrow(/Duplicate YAML key/);
});
test('Read-only YAML and compiled program endpoints do not create a run', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const before = await app.inject('/runs');
    const profile = await app.inject('/growth/workflows/profile');
    expect(profile.statusCode).toEqual(200);
    expect(profile.json().coverage.length).toEqual(20);
    expect(profile.json().requirements.length).toEqual(9);
    const source = await app.inject('/growth/workflows/profile/yaml');
    expect(source.statusCode).toEqual(200);
    expect(source.body).toMatch(/kind: "GrowthProfileWorkflow"/);
    expect(source.headers['cache-control']).toEqual('private, no-store');
    expect((await app.inject('/runs')).body).toEqual(before.body);
  } finally {
    await app.close();
  }
});

import { randomUUID } from 'node:crypto';
import type { RunRequest, RunSummary } from '../src/core/types.js';
import { validateRun } from '../src/core/validate.js';
import { ProfileGrowthCoordinator } from '../src/engine/profile-growth-coordinator.js';
import type { Runner } from '../src/runs/runner.js';
import { compileWorkflow } from '../src/workflows/workflow-yaml.js';

test('six dependent pipelines reuse validated Runner WorkflowPlans and record independent missing coverage', async () => {
  const runs = new Map<string, { summary: RunSummary; input: RunRequest }>();
  const actions: string[] = [];
  const stub = {
    start(input: RunRequest) {
      validateRun(input);
      expect(input.workflow).toBeTruthy();
      compileWorkflow(input.workflow);
      actions.push(input.action);
      const summary: RunSummary = {
        id: randomUUID(),
        platform: input.platform,
        action: input.action,
        state: 'completed',
        createdAt: new Date().toISOString(),
      };
      runs.set(summary.id, { summary, input });
      return summary;
    },
    get(id: string) {
      return runs.get(id)?.summary;
    },
    stepOutput(id: string, stageId: string) {
      const run = runs.get(id);
      if (!run) return null;
      expect(stageId).toEqual(run.input.action === 'audit-page' ? 'sectionEvidence' : 'baseline');
      return {
        schema: 'evidence/v1',
        url: run.input.pageUrl ?? run.input.profileUrl,
        digest: 'a'.repeat(64),
      };
    },
    cancel() {
      return true;
    },
    isIdle() {
      return true;
    },
  } as unknown as Runner;
  const coordinator = new ProfileGrowthCoordinator(stub);
  const accountId = 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b';
  const profile = 'https://www.linkedin.com/in/verified-owner/';
  const started = await coordinator.start(accountId, profile);
  expect(started.stages.length).toEqual(6);
  expect(started.coverage.length).toEqual(20);
  expect(started.counts.missing).toEqual(20);
  expect(started.canAdvance).toEqual(true);
  await expect((coordinator.supplyEvidence(started.id, {
      sectionId: 'headline',
      text: 'Not in the active identity stage',
    }))).rejects.toThrow(/current stage/);
  const afterEvidence = await coordinator.supplyEvidence(started.id, {
    sectionId: 'profilePhoto',
    text: 'Owner reports a current professional photograph.',
  });
  expect(afterEvidence.counts.ownerSupplied).toEqual(1);
  expect(afterEvidence.coverage.find((item) => item.id === 'profilePhoto')?.status).toEqual('owner-supplied-unverified');
  let stage = afterEvidence;
  for (let step = 0; step < 6; step++) {
    stage = await coordinator.advance(started.id);
    if (step < 5) expect(stage.activeIndex).toEqual(step + 1);
  }
  expect(actions).toEqual(['audit', 'audit', 'audit-page', 'audit-page', 'audit', 'audit']);
  expect(runs.size).toEqual(6);
  expect([...runs.values()].filter((r) => r.input.pageUrl).length).toEqual(2);
  expect(stage.status).toEqual('completed-with-gaps');
  expect(stage.counts.missing).toEqual(19);
  expect(stage.counts.independentlyProviderVerified).toEqual(0);
  await expect((coordinator.advance(started.id))).rejects.toThrow(/finalized/);
});

test('unverified Growth run cannot advance, and no valid account means no browser launch', async () => {
  let starts = 0;
  const runner = {
    start(input: RunRequest) {
      starts++;
      return {
        id: randomUUID(),
        platform: 'linkedin',
        action: input.action,
        createdAt: new Date().toISOString(),
        state: 'running',
      } as RunSummary;
    },
    get() {
      return { state: 'running' };
    },
    stepOutput() {
      return null;
    },
    cancel() {
      return true;
    },
    isIdle() {
      return true;
    },
  } as unknown as Runner;
  const coordinator = new ProfileGrowthCoordinator(runner);
  await expect((coordinator.start('bad-identity', 'https://www.linkedin.com/in/owner/'))).rejects.toThrow(/Verified LinkedIn account ID/);
  expect(starts).toEqual(0);
  const result = await coordinator.start(
    'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b',
    'https://www.linkedin.com/in/verified-owner/',
  );
  await expect((coordinator.advance(result.id))).rejects.toThrow(/not completed/);
  expect(starts).toEqual(1);
});

test('Growth composite API requires a genuine linked account, not arbitrary profile input', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const initial = await app.inject({
      method: 'GET',
      url: '/growth/workflows/profile/runs',
    });
    expect(initial.statusCode).toEqual(200);
    const start = await app.inject({
      method: 'POST',
      url: '/growth/workflows/profile/runs',
      payload: { accountId: 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b' },
    });
    expect(start.statusCode).toEqual(400);
    expect((await app.inject('/growth/workflows/profile/runs')).json().length).toEqual(0);
    expect((await app.inject('/growth/workflows/profile/runs/' + randomUUID())).statusCode).toEqual(404);
  } finally {
    await app.close();
  }
});

import { readGrowthTemplate, readGrowthTemplateCatalog } from '../src/engine/growth-profile.js';

test('all YAML Growth templates share the same discoverable manifest contract', async () => {
  const catalog = await readGrowthTemplateCatalog();
  expect(catalog.length >= 1).toBeTruthy();
  expect(catalog.find((item) => item.program.id === 'linkedin-profile')?.program.stages.length).toEqual(6);
  expect((await readGrowthTemplate('linkedin-profile'))?.program.id).toEqual('linkedin-profile');
  expect(await readGrowthTemplate('missing-template')).toEqual(null);
  const { yaml } = await readGrowthProfileWorkflow();
  const another = compileGrowthProfileYaml(
    yaml
      .replace('id: "linkedin-profile"', 'id: "linkedin-competitors"')
      .replace('    skills: "add-skill"\n', ''),
  );
  expect(another.id).toEqual('linkedin-competitors');
  expect(another.pipelines.length).toEqual(8);
  expect(another.stages.every(
      (stage) =>
        stage.plan.steps[0]?.kind === 'start' &&
        stage.plan.steps[1]?.kind === 'session' &&
        stage.plan.links.length > 0,
    )).toBeTruthy();
});

test('YAML Growth template API exposes the entire task graph and rejects unsupported runs', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const catalog = await app.inject('/growth/templates');
    expect(catalog.statusCode).toEqual(200);
    expect(catalog.json().some((item: { id: string }) => item.id === 'linkedin-profile')).toBeTruthy();
    const detail = await app.inject('/growth/templates/linkedin-profile');
    expect(detail.statusCode).toEqual(200);
    expect(detail.json().stages.length).toEqual(6);
    expect(detail.json().stages.every((item: { plan: { steps: unknown[] } }) => item.plan.steps.length >= 4)).toBeTruthy();
    expect((await app.inject('/growth/templates/linkedin-profile/yaml')).statusCode).toEqual(200);
    expect((await app.inject('/growth/templates/no-such-workflow')).statusCode).toEqual(404);
    const rejected = await app.inject({
      method: 'POST',
      url: '/growth/templates/linkedin-profile/runs',
      payload: { accountId: 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b' },
    });
    expect(rejected.statusCode).toEqual(400);
    expect((await app.inject('/growth/templates/linkedin-profile/runs')).json()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('composite runner reports failed pipelines and the exact failed child task', async () => {
  const id = 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b';
  const runner = {
    start(input: RunRequest) {
      return {
        id,
        platform: input.platform,
        action: input.action,
        state: 'failed',
        createdAt: new Date().toISOString(),
        currentStepId: 'inspect',
        error: 'Scoped profile inspection failed',
      } as RunSummary;
    },
    get() {
      return {
        id,
        platform: 'linkedin',
        action: 'audit',
        state: 'failed',
        createdAt: new Date().toISOString(),
        currentStepId: 'inspect',
        error: 'Scoped profile inspection failed',
      } as RunSummary;
    },
    stepOutput() {
      return null;
    },
    cancel() {
      return true;
    },
    isIdle() {
      return true;
    },
  } as unknown as Runner;
  const coordinator = new ProfileGrowthCoordinator(runner);
  const run = await coordinator.start(id, 'https://www.linkedin.com/in/verified-owner/');
  expect(run.pipelineRuns[0]?.state).toEqual('failed');
  expect(run.pipelineRuns[0]?.currentStepId).toEqual('inspect');
  expect(run.pipelineRuns[0]?.error ?? '').toMatch(/inspection failed/);
  await expect((coordinator.advance(run.id))).rejects.toThrow(/not completed/);
  expect(run.pipelineRuns[1]?.state).toEqual('waiting');
});

test('completed child waits for Runner browser cleanup before the next pipeline', async () => {
  const accountId = 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b';
  const children = new Map<string, RunSummary>();
  let idle = false;
  let starts = 0;
  const runner = {
    start(input: RunRequest) {
      starts++;
      const value: RunSummary = {
        id: randomUUID(),
        platform: input.platform,
        action: input.action,
        state: 'completed',
        createdAt: new Date().toISOString(),
      };
      children.set(value.id, value);
      return value;
    },
    get(id: string) {
      return children.get(id);
    },
    stepOutput() {
      return {
        schema: 'evidence/v1',
        url: 'https://www.linkedin.com/in/verified-owner/',
        digest: 'a'.repeat(64),
      };
    },
    isIdle() {
      return idle;
    },
    cancel() {
      return true;
    },
  } as unknown as Runner;
  const coordinator = new ProfileGrowthCoordinator(runner);
  const started = await coordinator.start(accountId, 'https://www.linkedin.com/in/verified-owner/');
  expect(started.currentChild?.state).toEqual('completed');
  expect(started.releasePending).toEqual(true);
  expect(started.canAdvance).toEqual(false);
  await expect((coordinator.advance(started.id))).rejects.toThrow(/browser session is still closing/);
  expect(starts).toEqual(1);
  expect((await coordinator.get(started.id))?.activeIndex).toEqual(0);
  idle = true;
  expect((await coordinator.get(started.id))?.canAdvance).toEqual(true);
  const next = await coordinator.advance(started.id);
  expect(next.activeIndex).toEqual(1);
  expect(starts).toEqual(2);
});

test('a second Growth YAML is discovered and compiled as one guarded pipeline', async () => {
  const templates = await readGrowthTemplateCatalog();
  const second = templates.find((item) => item.program.id === 'linkedin-branding');
  expect(second).toBeTruthy();
  expect(second.program.kind).toEqual('GrowthWorkflow');
  expect(second.program.stages.length).toEqual(1);
  expect(second.program.coverage.length).toEqual(5);
  expect(second.program.stages[0]?.sectionIds).toEqual(second.program.coverage.map((item) => item.id));
  expect(second.program.stages[0]?.plan.steps[1]?.kind).toEqual('session');
  expect(second.program.stages[0]!.plan.links.length >= 4).toBeTruthy();
  expect(() =>
      compileGrowthProfileYaml(
        second.yaml.replace('      action: "audit"', '      action: "edit-profile"'),
      )).toThrow(/Invalid or unsafe Growth pipeline stage configuration/);
  const app = buildApp();
  try {
    await app.ready();
    const detail = await app.inject('/growth/templates/linkedin-branding');
    expect(detail.statusCode).toEqual(200);
    expect(detail.json().stages.length).toEqual(1);
    expect((await app.inject('/growth/templates/linkedin-branding/yaml')).statusCode).toEqual(200);
    expect((await app.inject('/growth/templates/linkedin-branding/runs')).json()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('single-pipeline Growth reports all owner evidence without false provider verification', async () => {
  const runs = new Map<string, RunSummary>();
  const runner = {
    start(input: RunRequest) {
      validateRun(input);
      expect(input.workflow).toBeTruthy();
      compileWorkflow(input.workflow);
      const child: RunSummary = {
        id: randomUUID(),
        platform: input.platform,
        action: input.action,
        state: 'completed',
        createdAt: new Date().toISOString(),
      };
      runs.set(child.id, child);
      return child;
    },
    get(id: string) {
      return runs.get(id);
    },
    stepOutput() {
      return {
        schema: 'evidence/v1',
        url: 'https://www.linkedin.com/in/verified-owner/',
        digest: 'a'.repeat(64),
      };
    },
    isIdle() {
      return true;
    },
    cancel() {
      return true;
    },
  } as unknown as Runner;
  const coordinator = new ProfileGrowthCoordinator(runner);
  const started = await coordinator.start(
    'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b',
    'https://www.linkedin.com/in/verified-owner/',
    'linkedin-branding',
  );
  expect(started.stages.length).toEqual(1);
  expect(started.counts.total).toEqual(5);
  for (const field of started.coverage)
    await coordinator.supplyEvidence(started.id, {
      sectionId: field.id,
      text: 'Owner reported observation for ' + field.id,
    });
  const final = await coordinator.advance(started.id);
  expect(final.status).toEqual('completed-with-owner-evidence');
  expect(final.counts.missing).toEqual(0);
  expect(final.counts.independentlyProviderVerified).toEqual(0);
  expect(runs.size).toEqual(1);
});

test('Growth template library exposes exactly 21 YAML workflows with connected tasks', async () => {
  const templates = await readGrowthTemplateCatalog();
  expect(templates.length).toEqual(21);
  expect(new Set(templates.map((item) => item.program.id)).size).toEqual(21);
  for (const { program } of templates) {
    expect(program.stages.length >= 1).toBeTruthy();
    expect(program.stages.every((stage) => stage.plan.links.length === stage.plan.steps.length - 1)).toBeTruthy();
    expect(program.stages.every((stage) => stage.plan.steps.length >= 5)).toBeTruthy();
  }
  const blueprints = templates.filter((item) => item.program.kind === 'GrowthBlueprintWorkflow');
  expect(blueprints.length).toEqual(19);
  for (const { program } of blueprints) {
    expect(program.executable).toEqual(false);
    expect(program.stages.map((stage) => stage.id)).toEqual(['discovery', 'review']);
    expect(program.stages.every((stage) => stage.action === 'manual')).toBeTruthy();
    expect(program.stages.every((stage) =>
        ['todo', 'procedure', 'action', 'event', 'verify'].every((id) =>
          stage.plan.steps.some((step) => step.id === id),
        ),
      )).toBeTruthy();
  }
});

test('planning-only YAML can be previewed but must reject Runner launch', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const listed = await app.inject('/growth/templates');
    expect(listed.statusCode).toEqual(200);
    expect(listed.json().length).toEqual(21);
    const planned = listed.json().find((item: { id: string }) => item.id === 'linkedin-analytics');
    expect(planned.executable).toEqual(false);
    const detail = await app.inject('/growth/templates/linkedin-analytics');
    expect(detail.statusCode).toEqual(200);
    expect(detail.json().kind).toEqual('GrowthBlueprintWorkflow');
    expect(detail.json().stages.length).toEqual(2);
    const source = await app.inject('/growth/templates/linkedin-analytics/yaml');
    expect(source.statusCode).toEqual(200);
    expect(source.body).toMatch(/kind: "GrowthBlueprintWorkflow"/);
    const run = await app.inject({
      method: 'POST',
      url: '/growth/templates/linkedin-analytics/runs',
      payload: { accountId: 'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b' },
    });
    expect(run.statusCode).toEqual(409);
    expect(run.json().error).toMatch(/design-only/i);
  } finally {
    await app.close();
  }
});
