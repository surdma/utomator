import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const pipeline = (name) =>
  resolve(root, 'components/dashboard/pipeline', name);

test('mator attachment canvas module exists', () => {
  assert.equal(existsSync(pipeline('mator-attachment-canvas.tsx')), true);
});

test('operator chat panel exposes required mator testids and chrome', () => {
  const source = readFileSync(pipeline('operator-chat-panel.tsx'), 'utf8');
  for (const testid of [
    'mator-chat',
    'mator-conversation-switcher',
    'mator-restore-pipeline',
  ]) {
    assert.match(source, new RegExp(`data-testid="${testid}"`));
  }
  assert.match(source, /framer-motion/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /AnimatePresence/);
  assert.match(source, /MessageScroller/);
  assert.match(source, /MatorClarifyForm/);
  assert.match(source, /This workflow/);
  assert.match(source, /onNewConversation/);
  assert.match(source, /MatorAttachmentCanvas/);
  assert.doesNotMatch(source, /Groq capabilities/);
});

test('voice deck exposes stage confirm and multi-type attach composer', () => {
  const source = readFileSync(pipeline('voice-deck.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-stage-confirm"/);
  assert.match(source, /data-testid="mator-stage-reject"/);
  assert.match(source, /data-testid="mator-incomplete-continue"/);
  assert.match(source, /Paperclip/);
  assert.match(source, /ATTACH_ACCEPT/);
  assert.match(source, /onAttachFile/);
});

test('attachment canvas pins markers with reduced-motion aware motion', () => {
  const source = readFileSync(pipeline('mator-attachment-canvas.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-attachment-canvas"/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /framer-motion/);
  assert.match(source, /onMarkersChange/);
});

test('dashboard shell wires mator chat chrome into the operator panel', () => {
  const shell = readFileSync(
    resolve(root, 'components/dashboard/dashboard-shell.tsx'),
    'utf8',
  );
  assert.match(shell, /matorEvents=\{matorEvents\}/);
  assert.match(shell, /onReject=\{rejectChat\}/);
  assert.match(shell, /onRestorePipeline=/);
  assert.match(shell, /incompleteContinue/);
  assert.match(shell, /attachFile/);
  assert.match(shell, /saveMarkers/);
});

test('incomplete Continue sends Continue via useMatorChat', () => {
  const hook = readFileSync(pipeline('use-mator-chat.ts'), 'utf8');
  assert.match(hook, /incompleteContinue\s*=\s*useCallback/);
  assert.match(hook, /await send\(['"]Continue['"]\)/);
  const deck = readFileSync(pipeline('voice-deck.tsx'), 'utf8');
  assert.match(deck, /onIncompleteContinue/);
  assert.match(deck, /data-testid="mator-incomplete-continue"/);
});
