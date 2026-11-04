import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../components/mator',
);
const source = (name) => readFileSync(resolve(dir, name), 'utf8');

test('AI Call is explicitly started and preserves real separate mic/speaker/end controls', () => {
  const ui = source('mator-voice-listener.tsx');
  for (const key of [
    'mator-call-start',
    'mator-call-mic-mute',
    'mator-call-speaker-mute',
    'mator-call-end',
    'mator-call-pause',
    'mator-call-status',
  ]) {
    assert.match(ui, new RegExp(`data-testid="${key}"`));
  }
  assert.match(ui, /onClick=\{call\.start\}/);
  assert.match(ui, /onClick=\{call\.end\}/);
});

test('during a call the header owns mute and hang-up, not the listener deck', () => {
  const header = source('operator-chat-panel.tsx');
  assert.match(
    header,
    /call\.active && <MatorCallControls call=\{call\} \/>/,
    'mute + end call appear in the Mator header while the call runs',
  );
  const composer = source('mator-composer.tsx');
  assert.match(composer, /data-mode="voice-only"/);
  assert.match(composer, /<MatorVoiceListener call=\{call\}/);
  assert.doesNotMatch(
    composer,
    /mator-call-end|mator-call-mic-mute/,
    'the listener deck stays control-free so the transcript keeps its room',
  );
});

test('call preference remains independent from an active call', () => {
  const hook = source('use-mator-ai-call.ts');
  assert.match(hook, /if \(!voiceOnly \|\| !scope\) end\(\)/);
  assert.match(hook, /coordinatorRef\.current\?\.changeScope\(scope\)/);
  assert.match(
    hook,
    /const active = state\.phase !== 'idle' && state\.phase !== 'ended'/,
  );
  assert.match(hook, /transcribeMatorAudio\(audio,signal\)/);
  assert.match(hook, /sessionRef\.current\.speakAndCatch\(text,signal\)/);
});
