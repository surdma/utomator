import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { ActivityMemory } from '../../src/infrastructure/mator/mator-activity-memory.js';
import { loadIdentityTimeline } from '../../src/infrastructure/profile/profile-timeline.js';
import { RunArchive } from '../../src/infrastructure/runs/run-archive.js';
import { runtimePath } from '../../src/infrastructure/runtime/paths.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const paths: string[] = [];

async function observation(ownerId?: string, wrongRun = false) {
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
    [],
  );
  const path = runtimePath('runs', `${id}.jsonl`);
  paths.push(path, runtimePath('runs', id));
  const eventRunId = wrongRun ? randomUUID() : id;
  await writeFile(
    path,
    `${JSON.stringify({ id: 1, runId: eventRunId, time: new Date().toISOString(), kind: 'audit', message: 'Observed', details: { url: 'https://x.com/m3_private', bio: 'Private identity evidence' } })}\n`,
  );
  return { id, eventRunId };
}

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('indirect identity evidence reads reject foreign and ownerless archives', async () => {
  const own = await observation(alice);
  const foreign = await observation(bob);
  const legacy = await observation();
  const entries = await loadIdentityTimeline(alice);
  expect(entries.some((entry) => entry.runId === own.id)).toBe(true);
  expect(entries.some((entry) => entry.runId === foreign.id)).toBe(false);
  expect(entries.some((entry) => entry.runId === legacy.id)).toBe(false);
  expect(await loadIdentityTimeline('')).toEqual([]);
});

test('identity evidence cannot be injected from a row belonging to another run', async () => {
  const forged = await observation(alice, true);
  const entries = await loadIdentityTimeline(alice);
  expect(entries.some((entry) => entry.runId === forged.eventRunId)).toBe(false);
});

test('activity evidence is bound to the trusted owner across restarts', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'utomator-m3-memory-'));
  paths.push(root);
  const own = await new ActivityMemory(root, alice).addChat({ text: 'Private review evidence' });
  const other = await new ActivityMemory(root, bob).addChat({ text: 'Another private review' });
  const restored = await new ActivityMemory(root, alice).list();
  expect(restored.some((entry) => entry.id === own.id)).toBe(true);
  expect(restored.some((entry) => entry.id === other.id)).toBe(false);
  expect(own.ownerId).toBe(alice);
});

test('reading identity evidence leaves a live run archive unchanged', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'utomator-m3-live-timeline-'));
  paths.push(directory);
  const id = randomUUID();
  new RunArchive(directory).save(
    {
      id,
      ownerId: alice,
      platform: 'x',
      action: 'audit',
      state: 'running',
      createdAt: new Date().toISOString(),
      cleanupComplete: false,
    },
    [],
  );
  const summaryPath = resolve(directory, id, 'summary.json');
  const before = await readFile(summaryPath, 'utf8');
  await writeFile(
    resolve(directory, `${id}.jsonl`),
    JSON.stringify({
      id: 1,
      runId: id,
      kind: 'audit',
      time: new Date().toISOString(),
      message: 'Observed',
      details: { url: 'https://x.com/m3_live', bio: 'Current observation' },
    }) + '\n',
  );
  const entries = await loadIdentityTimeline(alice, directory);
  expect(await readFile(summaryPath, 'utf8')).toBe(before);
  expect(entries.some((entry) => entry.runId === id)).toBe(true);
});

test('identity evidence rejects a journal missing its recorded terminal event', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'utomator-m3-terminal-timeline-'));
  paths.push(directory);
  const id = randomUUID();
  new RunArchive(directory).save(
    {
      id,
      ownerId: alice,
      platform: 'x',
      action: 'audit',
      state: 'completed',
      createdAt: new Date().toISOString(),
      cleanupComplete: true,
      historyIncomplete: false,
      terminalEventId: 2,
    },
    [],
  );
  await writeFile(
    resolve(directory, `${id}.jsonl`),
    JSON.stringify({
      id: 1,
      runId: id,
      kind: 'audit',
      time: new Date().toISOString(),
      message: 'Observed',
      details: { url: 'https://x.com/m3_incomplete', bio: 'Unverified history' },
    }) + '\n',
  );
  expect(await loadIdentityTimeline(alice, directory)).toEqual([]);
});
