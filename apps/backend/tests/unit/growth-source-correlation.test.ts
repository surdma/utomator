import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { RunRequest, RunSummary } from '../../src/domain/types.js';
import type { DocumentStore } from '../../src/infrastructure/db/documents.js';
import { ProfileGrowthCoordinator } from '../../src/infrastructure/growth/profile-growth-coordinator.js';
import type { Runner } from '../../src/infrastructure/runs/runner.js';
import { compileWorkflow } from '../../src/infrastructure/workflows/workflow-yaml.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const account = '33333333-3333-4333-8333-333333333333';
const profile = 'https://www.linkedin.com/in/verified-owner/';

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Required test fixture is missing');
  return value;
}

function fixture() {
  const requests: RunRequest[] = [];
  const children = new Map<string, RunSummary>();
  const rows = new Map<string, { version: number; value: Record<string, unknown> }>();
  const runner = {
    start(input: RunRequest) {
      requests.push(input);
      const child: RunSummary = {
        id: randomUUID(),
        platform: input.platform,
        action: input.action,
        state: 'running',
        createdAt: new Date().toISOString(),
        ownerId: input.ownerId,
        growth: input.growth,
      };
      children.set(child.id, child);
      return child;
    },
    get: (id: string) => children.get(id),
    stepOutput: () => null,
    isIdle: () => true,
    cancel: () => true,
  } as unknown as Runner;
  const documents = {
    ownerId: owner,
    dialect: 'sqlite',
    async get(_namespace: string, key: string) {
      const row = rows.get(key);
      return row ? { key, ...row } : null;
    },
    async list() {
      return [...rows].map(([key, row]) => ({ key, ...row }));
    },
    async put(_namespace: string, key: string, value: Record<string, unknown>, version: number) {
      rows.set(key, { version: version + 1, value: structuredClone(value) });
      return version + 1;
    },
  } as unknown as DocumentStore;
  const coordinator = new ProfileGrowthCoordinator(runner, owner);
  coordinator.setDocuments(documents);
  return { coordinator, requests, children, rows };
}

test('a new Growth child is owned and bound to its exact pinned compiled stage plan', async () => {
  const { coordinator, requests } = fixture();
  const run = await coordinator.start(account, profile);
  const stage = required(run.stages[0]);
  const compiled = compileWorkflow(stage.plan);
  expect(run.ownerId).toBe(owner);
  expect(requests[0]?.ownerId).toBe(owner);
  expect(stage.planDigest).toBe(createHash('sha256').update(compiled.yaml).digest('hex'));
  expect(stage.stepDigests).toEqual(
    Object.fromEntries(compiled.steps.map((step) => [step.source.id, step.digest])),
  );
  expect(requests[0]?.growth).toEqual({
    parentRunId: run.id,
    programId: run.programId,
    programVersion: run.programVersion,
    sourceDigest: run.sourceDigest,
    stageId: stage.id,
    attempt: 1,
    planDigest: stage.planDigest,
  });
});

test.each([undefined, '', other])(
  'stored parent owned by %s is unavailable to this principal',
  async (recordOwner) => {
    const { coordinator, rows } = fixture();
    const run = await coordinator.start(account, profile);
    required(rows.get(run.id)).value.ownerId = recordOwner;
    expect(await coordinator.get(run.id)).toBeNull();
    expect(await coordinator.list()).toEqual([]);
    await expect(coordinator.advance(run.id)).rejects.toThrow(/not found/);
    await expect(
      coordinator.supplyEvidence(run.id, {
        sectionId: 'profilePhoto',
        text: 'Owner supplied an observation.',
      }),
    ).rejects.toThrow(/not found/);
  },
);

test('a foreign or unregistered child is not disclosed through the Growth summary', async () => {
  const { coordinator, children } = fixture();
  const run = await coordinator.start(account, profile);
  const stage = required(run.stages[0]);
  const child = required(children.get(required(stage.childRunId)));
  child.ownerId = other;
  child.error = 'Foreign secret';
  let result = await coordinator.get(run.id);
  expect(result?.currentChild).toBeNull();
  expect(result?.pipelineRuns[0]?.state).toBe('unavailable');
  expect(result?.pipelineRuns[0]?.error).toBeNull();
  child.ownerId = owner;
  child.growth = { ...required(child.growth), sourceDigest: 'f'.repeat(64) };
  result = await coordinator.get(run.id);
  expect(result?.currentChild).toBeNull();
  expect(result?.canAdvance).toBe(false);
});

test('an empty principal cannot construct a Growth coordinator', () => {
  expect(() => new ProfileGrowthCoordinator({} as Runner, '')).toThrow(/owner|principal/i);
});
