import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { RunArchive } from '../../src/infrastructure/runs/run-archive.js';

test('restart persists an interrupted failure and cannot restore a pending approval as complete', () => {
  const root = mkdtempSync(join(tmpdir(), 'utomator-recovery-'));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  try {
    new RunArchive(root).save(
      {
        id,
        platform: 'x',
        action: 'audit',
        ownerId: 'local-owner',
        createdAt: new Date().toISOString(),
        state: 'approval-needed',
        cleanupComplete: false,
        historyIncomplete: false,
        checkpoint: { id: 'pending-checkpoint', message: 'Review observation' },
      },
      ['start', 'finish'],
    );
    const [entry] = new RunArchive(root).restore();
    if (!entry) throw Error('Interrupted run was not restored');
    const restored = entry.summary;
    expect(restored).toMatchObject({ state: 'failed', historyIncomplete: true, cleanupComplete: false });
    expect(restored.checkpoint).toBeUndefined();
    const stored = JSON.parse(readFileSync(join(root, id, 'summary.json'), 'utf8'));
    expect(stored.summary).toMatchObject({
      state: 'failed',
      historyIncomplete: true,
      cleanupComplete: false,
    });
    expect(new RunArchive(root).restore()[0]?.summary.error).toMatch(/restart/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
