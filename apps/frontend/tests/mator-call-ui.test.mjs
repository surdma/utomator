
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test, expect } from 'vitest';
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
    expect(ui).toMatch(new RegExp(`data-testid="${key}"`));
  }
  expect(ui).toMatch(/onClick=\{call\.start\}/);
  expect(ui).toMatch(/onClick=\{call\.end\}/);
});

test('during a call the header owns mute and hang-up, not the listener deck', () => {
  const header = source('operator-chat-panel.tsx');
  expect(header).toMatch(/call\.active && <MatorCallControls call=\{call\} \/>/);
  const composer = source('mator-composer.tsx');
  expect(composer).toMatch(/data-mode="voice-only"/);
  expect(composer).toMatch(/<MatorVoiceListener call=\{call\}/);
  expect(composer).not.toMatch(/mator-call-end|mator-call-mic-mute/);
});

test('call preference remains independent from an active call', () => {
  const hook = source('use-mator-ai-call.ts');
  expect(hook).toMatch(/if \(!voiceOnly \|\| !scope\) end\(\)/);
  expect(hook).toMatch(/coordinatorRef\.current\?\.changeScope\(scope\)/);
  expect(hook).toMatch(/const active = state\.phase !== 'idle' && state\.phase !== 'ended'/);
  expect(hook).toMatch(/transcribeMatorAudio\(audio,signal\)/);
  expect(hook).toMatch(/sessionRef\.current\.speakAndCatch\(text,signal\)/);
});
