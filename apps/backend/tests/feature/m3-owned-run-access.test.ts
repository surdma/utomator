import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import Fastify from 'fastify';
import { afterEach, expect, test, vi } from 'vitest';
import type { RunSummary } from '../../src/domain/types.js';
import { RunArchive } from '../../src/infrastructure/runs/run-archive.js';
import { Runner } from '../../src/infrastructure/runs/runner.js';
import { runtimePath } from '../../src/infrastructure/runtime/paths.js';
import { registerRunRoutes, runIsAccessibleToOwner } from '../../src/interface/http/runs.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const checkpointId = '33333333-3333-4333-8333-333333333333';
const paths: string[] = [];
const apps: ReturnType<typeof Fastify>[] = [];

async function archived(ownerId?: string) {
  const id = randomUUID();
  const summary: RunSummary = {
    id,
    ownerId,
    platform: 'x',
    action: 'audit',
    state: 'completed',
    createdAt: new Date().toISOString(),
  };
  new RunArchive().save(summary, ['inspect']);
  paths.push(runtimePath('runs', id), runtimePath('runs', id + '.jsonl'), runtimePath('evidence', id));
  await writeFile(runtimePath('runs', id, 'workflow.yaml'), 'name: private workflow\n');
  await writeFile(runtimePath('runs', id, 'inspect.yaml'), 'name: private step\n');
  await writeFile(
    runtimePath('runs', id, 'inspect.output.json'),
    '{"schema":"page-observation/v1","private":"owner-only"}',
  );
  await writeFile(
    runtimePath('runs', id + '.jsonl'),
    JSON.stringify({
      id: 1,
      runId: id,
      time: new Date().toISOString(),
      kind: 'screenshot',
      message: 'Private capture',
      details: { stepId: 'inspect', fileName: 'capture.png' },
    }) + '\n',
  );
  await mkdir(runtimePath('evidence', id), { recursive: true });
  await writeFile(runtimePath('evidence', id, 'capture.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  return summary;
}

function routes(ownerId: string, runner = new Runner()) {
  const app = Fastify();
  registerRunRoutes(app, runner, {} as Parameters<typeof registerRunRoutes>[2], ownerId);
  apps.push(app);
  return app;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const endpoints = [
  { method: 'GET', path: '' },
  { method: 'GET', path: '/assessment' },
  { method: 'GET', path: '/workflow.yaml' },
  { method: 'GET', path: '/steps/inspect.yaml' },
  { method: 'GET', path: '/steps/inspect/output' },
  { method: 'GET', path: '/logs' },
  { method: 'GET', path: '/evidence/capture.png' },
  { method: 'GET', path: 'events' },
  { method: 'POST', path: '/decision', payload: { checkpointId, approved: true } },
  { method: 'POST', path: '/input', payload: { checkpointId, value: 'private code' } },
  { method: 'POST', path: '/pause' },
  { method: 'POST', path: '/resume' },
  { method: 'POST', path: '/cancel' },
] as const;

for (const [label, recordedOwner, principal] of [
  ['another owner', bob, alice],
  ['an ownerless hosted archive', undefined, alice],
  ['an ownerless local archive', undefined, 'local-owner'],
  ['a missing principal', alice, ''],
] as const) {
  test.each(endpoints)(`denies ${label} at $method $path`, async (endpoint) => {
    const run = await archived(recordedOwner);
    const app = routes(principal);
    const response = await app.inject({
      method: endpoint.method,
      url: endpoint.path === 'events' ? `/events/${run.id}` : `/runs/${run.id}${endpoint.path}`,
      ...('payload' in endpoint ? { payload: endpoint.payload } : {}),
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('private workflow');
    expect(response.body).not.toContain('owner-only');
  });
}

test('run discovery excludes foreign and ownerless records', async () => {
  const mine = await archived(alice);
  const foreign = await archived(bob);
  const legacy = await archived();
  const app = routes(alice);
  const response = await app.inject('/runs');
  expect(response.statusCode).toBe(200);
  const ids = response.json<RunSummary[]>().map((run) => run.id);
  expect(ids).toContain(mine.id);
  expect(ids).not.toContain(foreign.id);
  expect(ids).not.toContain(legacy.id);
});

test('an invalid principal cannot list or start runs', async () => {
  const runner = new Runner();
  vi.spyOn(runner, 'start').mockImplementation(() => {
    throw Error('Execution must never begin');
  });
  const app = routes('', runner);
  expect((await app.inject('/runs')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { platform: 'x', action: 'audit', profileUrl: 'https://x.com/owner' },
      })
    ).statusCode,
  ).toBe(401);
});

test('owner access requires an explicit matching stored identity', () => {
  const run = {
    id: randomUUID(),
    platform: 'x',
    action: 'audit',
    state: 'completed',
    createdAt: new Date().toISOString(),
  } as RunSummary;
  expect(runIsAccessibleToOwner(run, '')).toBe(false);
  expect(runIsAccessibleToOwner(run, 'local-owner')).toBe(false);
  expect(runIsAccessibleToOwner({ ...run, ownerId: alice }, alice)).toBe(true);
  expect(runIsAccessibleToOwner({ ...run, ownerId: bob }, alice)).toBe(false);
});
