
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { TenantWorkerManager } from '../hosted/workers.mjs';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const json = async (base, path, init) => {
  const result = await fetch(base.target + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-utomator-worker-token': base.secret,
      ...(init?.headers || {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: result.status, data: await result.json() };
};

test('real per-owner Fastify workers isolate SQL, legacy files, memory and saved account records', {
  timeout: 60000,
}, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'utomator-hosted-workers-'));
  const manager = new TenantWorkerManager({
    root: join(temp, 'tenants'),
    timeoutMs: 25000,
    maxWorkers: 2,
  });
  try {
    await expect((manager.start('local-owner'))).rejects.toThrow(/verified UUID/);
    const [a, b] = await Promise.all([manager.start(alice), manager.start(bob)]);
    expect(a.port).not.toEqual(b.port);
    expect(a.child.pid).not.toEqual(b.child.pid);
    expect(a.secret).not.toEqual(b.secret);
    const direct = await fetch(`${a.target}/account`);
    expect(direct.status).toEqual(401);
    const foreign = await fetch(`${a.target}/account`, {
      headers: { 'x-utomator-worker-token': b.secret },
    });
    expect(foreign.status).toEqual(401);
    expect(a.child.connected).toEqual(true);
    expect(b.child.connected).toEqual(true);
    expect((await json(a, '/career')).data.profile.name).toEqual('');
    expect((await json(b, '/career')).data.profile.name).toEqual('');

    const updated = await json(a, '/account/profile', {
      method: 'PUT',
      body: {
        expectedRevision: 0,
        document: {
          displayName: 'Alice Example',
          email: 'alice@example.org',
          location: 'Lagos',
          about: 'Alice only',
        },
      },
    });
    expect(updated.status).toEqual(200);
    expect(updated.data.profile.displayName).toEqual('Alice Example');
    expect((await json(b, '/account')).data.profile.displayName).toEqual('');
    expect((await json(a, '/account')).data.profile.displayName).toEqual('Alice Example');
    const bobUpdate = await json(b, '/account/profile', {
      method: 'PUT',
      body: {
        expectedRevision: 0,
        document: {
          displayName: 'Bob Example',
          email: 'bob@example.org',
          location: 'Abuja',
          about: 'Bob only',
        },
      },
    });
    expect(bobUpdate.status).toEqual(200);
    expect((await json(a, '/account')).data.profile.displayName).toEqual('Alice Example');

    const memory = await json(b, '/intelligence/chat', {
      method: 'POST',
      body: { text: 'Bob private career plans for next year', platform: 'linkedin' },
    });
    expect(memory.status).toEqual(201);
    expect((await json(a, '/intelligence')).data.length).toEqual(0);
    expect((await json(b, '/intelligence')).data.length).toEqual(1);

    const aliceDb = await stat(join(temp, 'tenants', alice, 'utomator.db'));
    const bobDb = await stat(join(temp, 'tenants', bob, 'utomator.db'));
    expect(aliceDb.size > 0).toBeTruthy();
    expect(bobDb.size > 0).toBeTruthy();
    expect((await json(b, '/runs')).data.length).toEqual(0);
    expect((await json(a, '/runs')).data.length).toEqual(0);
    // Simulate abrupt gateway loss by disconnecting the parent IPC channel.
    // The worker must terminate rather than continue exposing a live browser.
    const exited = new Promise((resolve) => a.child.once('exit', resolve));
    a.child.disconnect();
    let deadline;
    try {
      await Promise.race([
        exited,
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(Error('Orphan tenant worker survived gateway IPC loss')),
            7000,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
    const restarted = await manager.start(alice);
    expect((await json(restarted, '/account')).data.profile.displayName).toEqual('Alice Example');
    expect((await json(restarted, '/intelligence')).data.length).toEqual(0);
    expect((await json(b, '/account')).data.profile.displayName).toEqual('Bob Example');
  } finally {
    await manager.close();
    await rm(temp, { recursive: true, force: true });
  }
});
