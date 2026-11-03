import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { test } from 'node:test';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../components/mator');
const source = (name) => readFileSync(resolve(dir, name), 'utf8');

test('AI Call is explicitly started and preserves real separate mic/speaker/end controls', () => {
  const ui = source('mator-ai-call-panel.tsx');
  for (const key of ['mator-call-start', 'mator-call-mic-mute', 'mator-call-speaker-mute',
    'mator-call-end', 'mator-call-pause', 'mator-call-status']) {
    assert.match(ui, new RegExp(`data-testid="${key}"`));
  }
  assert.match(ui, /onClick=\{call\.start\}/);
  assert.match(ui, /onClick=\{call\.end\}/);
});

test('call preference remains independent from an active call', () => {
  const hook = source('use-mator-ai-call.ts');
  assert.match(hook, /if \(!voiceOnly \|\| !scope\) end\(\)/);
  assert.match(hook, /coordinatorRef\.current\?\.changeScope\(scope\)/);
  assert.match(hook, /const active = state\.phase !== 'idle' && state\.phase !== 'ended'/);
  assert.match(hook, /transcribeMatorAudio\(audio,signal\)/);
  assert.match(hook, /sessionRef\.current\.speakAndCatch\(text,signal\)/);
});