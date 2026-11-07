import { expect, test } from 'vitest';

// Skip document-store setup in tests (mirrors server.test.ts).
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

import { Runner } from '../src/infrastructure/runs/runner.js';
import { runIsAccessibleToOwner } from '../src/interface/http/runs.js';

const ownerA = '11111111-1111-1111-8111-111111111111';
const ownerB = '22222222-2222-2222-a222-222222222222';

function auditRun(ownerId) {
  return {
    platform: 'x',
    action: 'audit',
    profileUrl: 'https://x.com/surdma',
    ownerId,
  };
}

function summary(id, ownerId) {
  return {
    id,
    platform: 'x',
    action: 'audit',
    state: 'running',
    createdAt: new Date().toISOString(),
    ownerId,
  };
}

test("runIsAccessibleToOwner grants the run's own owner", () => {
  expect(runIsAccessibleToOwner(summary('r1', ownerA), ownerA)).toBe(true);
});

test('runIsAccessibleToOwner denies a different owner (wrong-run ID)', () => {
  expect(runIsAccessibleToOwner(summary('r1', ownerA), ownerB)).toBe(false);
});

test('runIsAccessibleToOwner denies an empty principal against an owned run', () => {
  expect(runIsAccessibleToOwner(summary('r1', ownerA), '')).toBe(false);
});

test('runIsAccessibleToOwner binds legacy ownerless runs to the trusted principal', () => {
  const ownerless = summary('r1', undefined);
  expect(runIsAccessibleToOwner(ownerless, ownerA)).toBe(true);
  expect(runIsAccessibleToOwner(ownerless, ownerB)).toBe(true);
});

test('Runner.start stamps the supplied owner identity on the summary (two distinct users)', {
  timeout: 15000,
}, () => {
  const runnerA = new Runner();
  const runnerB = new Runner();
  const a = runnerA.start(auditRun(ownerA));
  const b = runnerB.start(auditRun(ownerB));
  expect(a.ownerId).toBe(ownerA);
  expect(b.ownerId).toBe(ownerB);
  expect(runnerA.get(a.id).ownerId).toBe(ownerA);
  expect(runnerB.get(b.id).ownerId).toBe(ownerB);
});

test('Runner.start leaves ownerId undefined when none is supplied', () => {
  const runner = new Runner();
  const { ownerId: _o, ...rest } = auditRun(ownerA);
  const summary = runner.start(rest);
  expect(summary.ownerId).toBeUndefined();
});

test('route derives ownership from the trusted principal, not the client header', {
  timeout: 15000,
}, async () => {
  const app = buildApp();
  try {
    await app.ready();
    // Client attempts to impersonate another owner via a forged header.
    const created = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { 'x-owner-id': ownerB },
      payload: { platform: 'x', action: 'audit', profileUrl: 'https://x.com/surdma' },
    });
    expect(created.statusCode).toBe(202);
    const run = created.json();
    // The run is stamped with the trusted principal (local-owner), never the forged header.
    expect(run.ownerId).toBe('local-owner');

    // The trusted owner can read their own run.
    const mine = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().ownerId).toBe('local-owner');

    // The run list only discloses runs attributable to the trusted principal.
    const list = await app.inject({ method: 'GET', url: '/runs' });
    expect(list.statusCode).toBe(200);
    expect(list.json().every((r) => r.ownerId === undefined || r.ownerId === 'local-owner')).toBe(true);
  } finally {
    await app.close();
  }
});
