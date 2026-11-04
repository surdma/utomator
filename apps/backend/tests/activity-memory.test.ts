import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ActivityMemory } from '../src/mator/mator-activity-memory.js';

test('conversation memory stores user messages as chat evidence, never invented facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-memory-'));
  try {
    const memory = new ActivityMemory(root);
    const first = await memory.addChat({
      text: 'Prefer concise application letters.',
      platform: 'linkedin',
    });
    assert.equal(first.source, 'chat');
    assert.equal(first.platform, 'linkedin');
    const records = await memory.list();
    assert(
      records.some(
        (item) => item.id === first.id && item.text === 'Prefer concise application letters.',
      ),
    );
    await assert.rejects(
      memory.addChat({ text: 'My password is somebody-secret' }),
      /Do not save secrets/,
    );
    await assert.rejects(memory.addChat({ text: 'x' }), /2–2000/);
    const restarted = new ActivityMemory(root);
    const again = await restarted.list();
    assert(again.some((item) => item.id === first.id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
