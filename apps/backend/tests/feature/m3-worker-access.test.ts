import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, afterEach, expect, test, vi } from 'vitest';

const root = await mkdtemp(resolve(tmpdir(), 'utomator-m3-worker-'));
vi.mock('../../src/infrastructure/runtime/paths.js', () => ({
  RUNTIME_DIR: root,
  runtimePath: (...parts: string[]) => resolve(root, ...parts),
}));
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../../src/main.js');
const { RunArchive } = await import('../../src/infrastructure/runs/run-archive.js');
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const token = randomUUID();

afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test.each([bob, undefined])('visual capture cannot bypass ownership for %s', async (ownerId) => {
  const id = randomUUID();
  new RunArchive().save(
    {
      id,
      ownerId,
      platform: 'x',
      action: 'audit',
      state: 'completed',
      createdAt: new Date().toISOString(),
    },
    ['inspect'],
  );
  await writeFile(
    resolve(root, 'runs', id + '.jsonl'),
    JSON.stringify({
      id: 1,
      runId: id,
      time: new Date().toISOString(),
      kind: 'screenshot',
      message: 'Private',
      details: { fileName: 'capture.png', stepId: 'inspect' },
    }) + '\n',
  );
  await mkdir(resolve(root, 'evidence', id), { recursive: true });
  await writeFile(resolve(root, 'evidence', id, 'capture.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const app = buildApp();
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/visual-reviews',
      payload: {
        platform: 'x',
        handle: 'private_owner',
        pageUrl: 'https://x.com/private_owner',
        nodeId: 'inspect',
        note: '',
        regions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.3, label: 'Bio', request: 'Inspect' }],
        source: { kind: 'capture', runId: id, fileName: 'capture.png' },
      },
    });
    expect(response.statusCode).toBe(400);
    const reviews = await app.inject('/visual-reviews');
    expect(
      reviews.json().some((review: { source: { runId?: string } }) => review.source.runId === id),
    ).toBe(false);
  } finally {
    await app.close();
  }
});

test('hosted run APIs require the worker token and ignore an impersonated owner header', async () => {
  vi.stubEnv('UTOMATOR_INTERNAL_OWNER_ID', alice);
  vi.stubEnv('UTOMATOR_INTERNAL_TOKEN', token);
  const app = buildApp();
  try {
    for (const headers of [{}, { 'x-utomator-worker-token': 'wrong' }, { 'x-owner-id': alice }]) {
      expect((await app.inject({ url: '/runs', headers })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/runs/' + randomUUID() + '/cancel', headers }))
          .statusCode,
      ).toBe(401);
    }
    const valid = await app.inject({
      url: '/runs',
      headers: { 'x-utomator-worker-token': token, 'x-owner-id': bob },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().every((run: { ownerId?: string }) => run.ownerId === alice)).toBe(true);
  } finally {
    await app.close();
  }
});

test('a configured hosted principal without a worker secret fails closed', async () => {
  vi.stubEnv('UTOMATOR_INTERNAL_OWNER_ID', alice);
  vi.stubEnv('UTOMATOR_INTERNAL_TOKEN', '');
  const app = buildApp();
  try {
    expect((await app.inject('/runs')).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});
