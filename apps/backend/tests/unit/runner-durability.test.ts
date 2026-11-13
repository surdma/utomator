import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EventJournal } from '../../src/domain/events.js';
import { defaultPlan } from '../../src/domain/workflow-plan.js';
import { BrowserSession } from '../../src/infrastructure/browser/session.js';
import { RunArchive } from '../../src/infrastructure/runs/run-archive.js';
import { parseRunJournal } from '../../src/infrastructure/runs/run-journal.js';
import { Runner } from '../../src/infrastructure/runs/runner.js';
import type { WorkflowContext } from '../../src/infrastructure/workflow-steps/context.js';
import { compileWorkflow } from '../../src/infrastructure/workflows/workflow-yaml.js';

const fixture = vi.hoisted(() => ({
  root: '',
  operation: async (_context: WorkflowContext): Promise<void> => {},
}));

vi.mock('../../src/infrastructure/runtime/paths.js', async () => {
  const { resolve } = await import('node:path');
  return { runtimePath: (...parts: string[]) => resolve(fixture.root, ...parts) };
});
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    appendFileSync: vi.fn(actual.appendFileSync),
    truncateSync: vi.fn(actual.truncateSync),
  };
});
vi.mock('../../src/infrastructure/workflows/execute.js', () => ({
  execute: (context: WorkflowContext) => fixture.operation(context),
}));

let actualAppend: typeof appendFileSync;
beforeEach(async () => {
  fixture.root = mkdtempSync(join(tmpdir(), 'utomator-durable-'));
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  actualAppend = actual.appendFileSync;
  vi.mocked(appendFileSync).mockReset().mockImplementation(actualAppend);
  vi.mocked(truncateSync).mockReset().mockImplementation(actual.truncateSync);
  fixture.operation = async (context) => context.emit('audit', 'Observed a controlled page');
  vi.spyOn(BrowserSession.prototype, 'open').mockResolvedValue({
    goto: async () => {},
    url: () => 'https://x.com/durable',
    locator: () => ({ innerText: async () => 'Controlled browser observation' }),
  } as unknown as Awaited<ReturnType<BrowserSession['open']>>);
  vi.spyOn(BrowserSession.prototype, 'close').mockResolvedValue();
});
afterEach(() => {
  vi.mocked(appendFileSync).mockRestore();
  vi.mocked(truncateSync).mockRestore();
  vi.restoreAllMocks();
  rmSync(fixture.root, { recursive: true, force: true });
});

const input = () => ({
  platform: 'x' as const,
  action: 'audit' as const,
  profileUrl: 'https://x.com/durable',
  ownerId: 'local-owner',
});

async function idle(runner: Runner) {
  await vi.waitFor(() => expect(runner.isIdle()).toBe(true));
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Required test fixture is missing');
  return value;
}

test('failed persistence never broadcasts ghost events and its failed summary survives restart', async () => {
  vi.mocked(appendFileSync).mockImplementation(() => {
    throw new Error('ENOSPC: controlled outage');
  });
  const runner = new Runner();
  const received: unknown[] = [];
  runner.events.subscribe((event) => received.push(event));
  const run = runner.start(input());
  await idle(runner);
  expect(run.state).toBe('failed');
  expect(received).toEqual([]);
  expect(runner.events.getSince(0, run.id)).toEqual([]);
  expect(run.historyIncomplete).toBe(true);
  expect(run.terminalEventId).toBeUndefined();
  const restored = new Runner().get(run.id);
  expect(restored).toMatchObject({ state: 'failed', historyIncomplete: true });
});

test('a partial append retries the same record after rollback without replaying the browser action', async () => {
  let fail = true;
  let actions = 0;
  fixture.operation = async (context) => {
    actions += 1;
    context.emit('audit', 'Controlled read completed');
  };
  vi.mocked(appendFileSync).mockImplementation((file, data, options) => {
    if (fail && String(data).includes('Controlled read completed')) {
      fail = false;
      actualAppend(file, String(data).slice(0, 11), options);
      throw new Error('EIO: partial write');
    }
    actualAppend(file, data, options);
  });
  const runner = new Runner();
  const received: Array<{ id: number }> = [];
  runner.events.subscribe((event) => received.push(event));
  const run = runner.start(input());
  await idle(runner);
  expect(run.state).toBe('completed');
  expect(actions).toBe(1);
  const raw = readFileSync(join(fixture.root, 'runs', `${run.id}.jsonl`), 'utf8');
  const page = parseRunJournal(raw, run.id, { since: 0 });
  expect(page.events.map((event) => event.id)).toEqual(received.map((event) => event.id));
  expect(page.events.filter((event) => event.message === 'Controlled read completed')).toHaveLength(1);
  expect(page.events.at(-1)?.id).toBe(run.terminalEventId);
});

test('a failed rollback after a partial append leaves compromised history unavailable after restart', async () => {
  let actions = 0;
  let partialAppends = 0;
  fixture.operation = async (context) => {
    actions += 1;
    context.emit('audit', 'Controlled rollback failure');
  };
  vi.mocked(appendFileSync).mockImplementation((file, data, options) => {
    if (String(data).includes('Controlled rollback failure')) {
      partialAppends += 1;
      actualAppend(file, String(data).slice(0, 11), options);
      throw new Error('EIO: partial append');
    }
    actualAppend(file, data, options);
  });
  vi.mocked(truncateSync).mockImplementation(() => {
    throw new Error('EACCES: rollback truncate unavailable');
  });
  const runner = new Runner();
  const received: unknown[] = [];
  runner.events.subscribe((event) => received.push(event));
  const run = runner.start(input());
  await idle(runner);

  expect(run).toMatchObject({ state: 'failed', historyIncomplete: true, cleanupComplete: true });
  expect(run.error).toMatch(/rollback failed/);
  expect(run.terminalEventId).toBeUndefined();
  expect(actions).toBe(1);
  expect(partialAppends).toBe(1);
  expect(truncateSync).toHaveBeenCalledOnce();
  expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
  const raw = readFileSync(join(fixture.root, 'runs', `${run.id}.jsonl`), 'utf8');
  expect(() => parseRunJournal(raw, run.id, { since: 0 })).toThrow(/History incomplete/);
  const committed = raw.slice(0, raw.lastIndexOf('\n') + 1);
  expect(received).toEqual(parseRunJournal(committed, run.id, { since: 0 }).events);
  expect(committed).not.toContain('"terminalState"');
  const restored = new Runner();
  expect(restored.get(run.id)).toMatchObject({ state: 'failed', historyIncomplete: true });
  await expect(restored.journalPage(run.id, { since: 0 })).rejects.toThrow(/History incomplete/);
});

test('completion waits for successful browser cleanup and the Runner stays locked', async () => {
  let release = () => {};
  let closing = false;
  const cleanup = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(BrowserSession.prototype.close).mockImplementation(async () => {
    closing = true;
    await cleanup;
  });
  const runner = new Runner();
  const run = runner.start(input());
  try {
    await vi.waitFor(() => expect(closing).toBe(true));
    expect(run.state).not.toBe('completed');
    expect(runner.isIdle()).toBe(false);
    expect(() => runner.start(input())).toThrow(/BUSY/);
  } finally {
    release();
    await idle(runner);
  }
  expect(run).toMatchObject({ state: 'completed', cleanupComplete: true });
});

test('cleanup failure cannot leave a completed run or retain the active lock', async () => {
  vi.mocked(BrowserSession.prototype.close).mockRejectedValue(new Error('Controlled close failure'));
  const runner = new Runner();
  const run = runner.start(input());
  await idle(runner);
  expect(run).toMatchObject({ state: 'failed', cleanupComplete: false });
  expect(run.error).toMatch(/cleanup/i);
  expect(new Runner().get(run.id)).toMatchObject({ state: 'failed', cleanupComplete: false });
});

test('Stop aborts even when its journal append fails and holds the lock until cleanup', async () => {
  let context: WorkflowContext | undefined;
  let release = () => {};
  const operation = new Promise<void>((resolve) => {
    release = resolve;
  });
  fixture.operation = async (value) => {
    context = value;
    await operation;
  };
  const runner = new Runner();
  const run = runner.start(input());
  await vi.waitFor(() => expect(context).toBeDefined());
  vi.mocked(appendFileSync).mockImplementation((file, data, options) => {
    if (String(data).includes('Operator requested Stop')) throw new Error('ENOSPC: stop write');
    actualAppend(file, data, options);
  });
  try {
    expect(runner.cancel(run.id)).toBe(true);
    expect(context?.signal.aborted).toBe(true);
    expect(runner.isIdle()).toBe(false);
    expect(() => runner.start(input())).toThrow(/BUSY/);
  } finally {
    release();
    await idle(runner);
  }
  expect(run.state).not.toBe('completed');
});

test('cancellation during a compiled action cannot persist a completed task', async () => {
  let context: WorkflowContext | undefined;
  let release = () => {};
  const operation = new Promise<void>((resolve) => {
    release = resolve;
  });
  fixture.operation = async (value) => {
    context = value;
    await operation;
  };
  const runner = new Runner();
  const run = runner.start({ ...input(), workflow: defaultPlan('x', 'audit') });
  await vi.waitFor(() => expect(context).toBeDefined());
  runner.cancel(run.id);
  release();
  await idle(runner);
  expect(run.state).toBe('cancelled');
  expect(run.completedStepIds).not.toContain('action');
  expect(runner.stepOutput(run.id, 'action')).toBeNull();
});

test('an unwritten allocation does not evict durable memory or consume an event identity', () => {
  const journal = new EventJournal();
  for (let index = 0; index < 1000; index++) {
    journal.publish({ runId: 'one', kind: 'status', message: String(index) });
  }
  const failed = journal.allocate({ runId: 'one', kind: 'status', message: 'unwritten' });
  journal.retract(failed.id);
  expect(journal.getSince(0, 'one')).toHaveLength(1000);
  expect(journal.getSince(0, 'one')[0]?.id).toBe(1);
  expect(journal.publish({ runId: 'one', kind: 'status', message: 'durable' }).id).toBe(1001);
});

test('a restarted Runner replays all persisted pages beyond the memory window', async () => {
  fixture.operation = async (context) => {
    for (let index = 0; index < 1010; index++) context.emit('audit', `Observation ${index}`);
  };
  const runner = new Runner();
  const run = runner.start(input());
  await idle(runner);
  const restored = new Runner();
  const first = await restored.journalPage(run.id, { since: 0 });
  expect(first.events).toHaveLength(1000);
  expect(first.hasMore).toBe(true);
  const second = await restored.journalPage(run.id, { since: required(first.events.at(-1)).id });
  expect(second.hasMore).toBe(false);
  expect([...first.events, ...second.events].filter((event) => event.kind === 'audit')).toHaveLength(
    1010,
  );
  expect(second.events.at(-1)?.id).toBe(run.terminalEventId);
});

test('Growth events and output artifacts carry the registered source, attempt and actual step digest', async () => {
  const plan = defaultPlan('x', 'audit');
  const compiled = compileWorkflow(plan);
  const growth = {
    parentRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    programId: 'controlled-program',
    programVersion: 2,
    sourceDigest: 'a'.repeat(64),
    stageId: 'baseline',
    attempt: 1,
    planDigest: createHash('sha256').update(compiled.yaml).digest('hex'),
  };
  fixture.operation = async (context) =>
    context.emit('screenshot', 'Captured actual action', { fileName: 'actual.png' });
  const runner = new Runner();
  const run = runner.start({ ...input(), workflow: plan, growth });
  await idle(runner);
  const events = parseRunJournal(
    readFileSync(join(fixture.root, 'runs', `${run.id}.jsonl`), 'utf8'),
    run.id,
  ).events;
  expect(run.growth).toEqual(growth);
  expect(events.every((event) => JSON.stringify(event.growth) === JSON.stringify(growth))).toBe(true);
  const completed = events.find(
    (event) =>
      event.kind === 'step' &&
      (event.details as { stepId?: string; stage?: string })?.stepId === 'action' &&
      (event.details as { stage?: string })?.stage === 'completed',
  );
  const action = required(compiled.steps.find((step) => step.source.id === 'action'));
  const artifact = readFileSync(join(fixture.root, 'runs', run.id, 'action.output.json'), 'utf8');
  expect(completed?.details).toMatchObject({
    attempt: 1,
    yamlSha256: action.digest,
    outputId: `${run.id}:action:output`,
    outputDigest: createHash('sha256').update(artifact).digest('hex'),
  });
  expect(JSON.parse(artifact)).toMatchObject({
    runId: run.id,
    growth,
    attempt: 1,
    yamlSha256: action.digest,
  });
  expect(events.find((event) => event.kind === 'screenshot')?.details).toMatchObject({
    stepId: 'action',
    attempt: 1,
    yamlSha256: action.digest,
    evidenceId: `${run.id}:actual.png`,
  });
});

test('Runner rejects a supplied Growth plan digest that does not describe the compiled YAML', () => {
  const runner = new Runner();
  expect(() =>
    runner.start({
      ...input(),
      workflow: defaultPlan('x', 'audit'),
      growth: {
        parentRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        programId: 'controlled-program',
        programVersion: 1,
        sourceDigest: 'a'.repeat(64),
        stageId: 'baseline',
        attempt: 1,
        planDigest: 'f'.repeat(64),
      },
    }),
  ).toThrow(/Growth.*(digest|identity)/);
});

test('known journal failure stays unavailable even when its failed terminal record can be persisted', async () => {
  vi.mocked(appendFileSync).mockImplementation((file, data, options) => {
    if (String(data).includes('Run queued')) throw new Error('EIO: failed startup record');
    actualAppend(file, data, options);
  });
  const runner = new Runner();
  const run = runner.start(input());
  await idle(runner);
  expect(run).toMatchObject({ state: 'failed', historyIncomplete: true });
  expect(run.terminalEventId).toBeGreaterThan(0);
  await expect(new Runner().journalPage(run.id, { since: 0 })).rejects.toThrow(/History incomplete/);
});

test('a screenshot row with a foreign run cannot authorize evidence', async () => {
  const runner = new Runner();
  const run = runner.start(input());
  await idle(runner);
  actualAppend(
    join(fixture.root, 'runs', `${run.id}.jsonl`),
    JSON.stringify({
      id: 9999,
      runId: 'foreign',
      kind: 'screenshot',
      time: new Date().toISOString(),
      message: 'untrusted',
      details: { fileName: 'secret.png' },
    }) + '\n',
  );
  await expect(new Runner().isScreenshotAuthorized(run.id, 'secret.png')).resolves.toBe(false);
});

test.each(['step-start', 'step-completion', 'checkpoint', 'terminal'] as const)(
  '%s append failure cannot escape as a durable completion',
  async (boundary) => {
    let actions = 0;
    fixture.operation = async (context) => {
      actions += 1;
      if (boundary === 'checkpoint') await context.approve('Review this controlled observation');
    };
    const fails = (event: {
      kind: string;
      details?: { stepId?: string; stage?: string; terminalState?: string };
    }) =>
      (boundary === 'step-start' &&
        event.kind === 'step' &&
        event.details?.stepId === 'action' &&
        event.details.stage === 'started') ||
      (boundary === 'step-completion' &&
        event.kind === 'step' &&
        event.details?.stepId === 'action' &&
        event.details.stage === 'completed') ||
      (boundary === 'checkpoint' && event.kind === 'approval') ||
      (boundary === 'terminal' && event.details?.terminalState === 'completed');
    vi.mocked(appendFileSync).mockImplementation((file, data, options) => {
      if (fails(JSON.parse(String(data)))) throw new Error('EIO: controlled boundary failure');
      actualAppend(file, data, options);
    });
    const runner = new Runner();
    const received: Array<{ kind: string }> = [];
    runner.events.subscribe((event) => received.push(event));
    const run = runner.start({ ...input(), workflow: defaultPlan('x', 'audit') });
    await idle(runner);
    expect(run).toMatchObject({ state: 'failed', historyIncomplete: true, cleanupComplete: true });
    expect(received.some(fails)).toBe(false);
    expect(actions).toBe(boundary === 'step-start' ? 0 : 1);
    expect(new Runner().get(run.id)).toMatchObject({ state: 'failed', historyIncomplete: true });
    if (boundary !== 'terminal') expect(run.completedStepIds).not.toContain('action');
    expect(runner.stepOutput(run.id, 'action')).toBeNull();
  },
);

test('an approval checkpoint includes its exact persisted evidence binding', async () => {
  const base = defaultPlan('x', 'audit');
  const steps = [
    ...base.steps.slice(0, 3),
    {
      id: 'evidence',
      kind: 'evidence' as const,
      title: 'Capture evidence',
      inputBindings: { observation: { stepId: 'inspect', field: 'excerpt' as const } },
    },
    {
      id: 'approval',
      kind: 'approve' as const,
      title: 'Review evidence',
      inputBindings: { evidence: { stepId: 'evidence', field: 'digest' as const } },
    },
    ...base.steps.slice(3),
  ];
  const workflow = {
    ...base,
    steps,
    links: steps.slice(1).map((step, index) => ({ source: required(steps[index]).id, target: step.id })),
  };
  const runner = new Runner();
  const run = runner.start({ ...input(), workflow });
  try {
    await vi.waitFor(() => expect(run.state).toBe('approval-needed'));
    const output = runner.stepOutput(run.id, 'evidence');
    expect(output?.schema).toBe('evidence/v1');
    const event = runner.events.getSince(0, run.id).find((item) => item.kind === 'approval');
    expect(event?.details).toMatchObject({
      checkpointId: run.checkpoint?.id,
      stepId: 'approval',
      attempt: 1,
      evidenceStepId: 'evidence',
      evidenceOutputId: `${run.id}:evidence:output`,
      evidenceDigest: output?.schema === 'evidence/v1' ? output.digest : null,
    });
    expect(runner.decide(run.id, 'wrong-checkpoint', true)).toBe(false);
    expect(runner.decide(run.id, required(run.checkpoint).id, true)).toBe(true);
    await idle(runner);
    expect(run.state).toBe('completed');
  } finally {
    if (!runner.isIdle()) {
      runner.cancel(run.id);
      await idle(runner);
    }
  }
});

test('a source conflict beyond the first journal page invalidates earlier screenshot authorization', async () => {
  const workflow = defaultPlan('x', 'audit');
  const growth = {
    parentRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    programId: 'controlled-program',
    programVersion: 1,
    sourceDigest: 'a'.repeat(64),
    stageId: 'baseline',
    attempt: 1,
    planDigest: createHash('sha256').update(compileWorkflow(workflow).yaml).digest('hex'),
  };
  fixture.operation = async (context) => {
    context.emit('screenshot', 'Captured actual action', { fileName: 'actual.png' });
    for (let index = 0; index < 1010; index++) context.emit('audit', `Observation ${index}`);
  };
  const runner = new Runner();
  const run = runner.start({ ...input(), workflow, growth });
  await idle(runner);
  actualAppend(
    join(fixture.root, 'runs', `${run.id}.jsonl`),
    JSON.stringify({
      id: 9999,
      runId: run.id,
      kind: 'status',
      time: new Date().toISOString(),
      message: 'Wrong source',
      growth: { ...growth, sourceDigest: 'b'.repeat(64) },
    }) + '\n',
  );
  await expect(new Runner().isScreenshotAuthorized(run.id, 'actual.png')).resolves.toBe(false);
});

test('a missing committed terminal record is history incomplete even when remaining JSONL is valid', async () => {
  const runner = new Runner();
  const run = runner.start(input());
  await idle(runner);
  const path = join(fixture.root, 'runs', `${run.id}.jsonl`);
  const rows = readFileSync(path, 'utf8').trimEnd().split('\n');
  rows.pop();
  writeFileSync(path, `${rows.join('\n')}\n`);
  await expect(new Runner().journalPage(run.id, { since: 0 })).rejects.toThrow(/History incomplete/);
});

test('a summary failure while resuming rejects the pause, cleans up, and releases the Runner', async () => {
  const base = defaultPlan('x', 'audit');
  const steps = [
    ...base.steps.slice(0, 3),
    { id: 'checkpoint', kind: 'pause' as const, title: 'Wait for operator review' },
    ...base.steps.slice(3),
  ];
  const workflow = {
    ...base,
    steps,
    links: steps.slice(1).map((step, index) => ({ source: required(steps[index]).id, target: step.id })),
  };
  let actions = 0;
  fixture.operation = async () => {
    actions += 1;
  };
  const runner = new Runner();
  const received: Array<{ message: string }> = [];
  runner.events.subscribe((event) => received.push(event));
  const run = runner.start({ ...input(), workflow });
  await vi.waitFor(() => expect(run.state).toBe('paused'));
  const save = RunArchive.prototype.save;
  vi.spyOn(RunArchive.prototype, 'save').mockImplementation(function (summary, stepIds) {
    if (summary.state === 'running' && summary.currentStepId === 'checkpoint')
      throw new Error('EIO: controlled resume summary failure');
    return save.call(this, summary, stepIds);
  });

  expect(() => runner.resume(run.id)).toThrow(/controlled resume summary failure/);
  await idle(runner);
  expect(run).toMatchObject({ state: 'failed', cleanupComplete: true, historyIncomplete: true });
  expect(run.error).toMatch(/controlled resume summary failure/);
  expect(actions).toBe(0);
  expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
  expect(received.some((event) => event.message === 'Run resumed')).toBe(false);
  expect(new Runner().get(run.id)).toMatchObject({ state: 'failed', historyIncomplete: true });
  const raw = readFileSync(join(fixture.root, 'runs', `${run.id}.jsonl`), 'utf8');
  const page = parseRunJournal(raw, run.id, { since: 0 });
  expect(page.events.at(-1)?.id).toBe(run.terminalEventId);
});

test.each(['approval', 'input'] as const)(
  'Stop after an accepted %s response cannot release the cancelled workflow',
  async (kind) => {
    let continued = false;
    fixture.operation = async (context) => {
      if (kind === 'approval') await context.approve('Review this action');
      else await context.ask('Choose an observed value');
      continued = true;
    };
    const runner = new Runner();
    const run = runner.start(input());
    await vi.waitFor(() => expect(run.checkpoint).toBeDefined());
    const checkpointId = required(run.checkpoint).id;
    expect(
      kind === 'approval'
        ? runner.decide(run.id, checkpointId, true)
        : runner.answerText(run.id, checkpointId, 'Confirmed value'),
    ).toBe(true);
    expect(runner.cancel(run.id)).toBe(true);
    await idle(runner);
    expect(continued).toBe(false);
    expect(run).toMatchObject({ state: 'cancelled', cleanupComplete: true });
    expect(run.checkpoint).toBeUndefined();
    expect(runner.decide(run.id, checkpointId, true)).toBe(false);
    expect(runner.answerText(run.id, checkpointId, 'Late response')).toBe(false);
    expect(
      runner.events
        .getSince(0, run.id)
        .some((event) =>
          /Operator approved checkpoint|Operator supplied requested text/.test(event.message),
        ),
    ).toBe(false);
  },
);
