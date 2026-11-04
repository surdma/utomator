
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { ActivityMemory } from '../src/mator/mator-activity-memory.js';

test('conversation memory stores user messages as chat evidence, never invented facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-memory-'));
  try {
    const memory = new ActivityMemory(root);
    const first = await memory.addChat({
      text: 'Prefer concise application letters.',
      platform: 'linkedin',
    });
    expect(first.source).toEqual('chat');
    expect(first.platform).toEqual('linkedin');
    const records = await memory.list();
    expect(records.some(
        (item) => item.id === first.id && item.text === 'Prefer concise application letters.',
      )).toBeTruthy();
    await expect((memory.addChat({ text: 'My password is somebody-secret' }))).rejects.toThrow(/Do not save secrets/);
    await expect((memory.addChat({ text: 'x' }))).rejects.toThrow(/2–2000/);
    const restarted = new ActivityMemory(root);
    const again = await restarted.list();
    expect(again.some((item) => item.id === first.id)).toBeTruthy();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
