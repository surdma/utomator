import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const pipeline = (name) => resolve(root, 'components/dashboard/pipeline', name);
const ui = (name) => resolve(root, 'components/ui', name);
const aiElements = (name) => resolve(root, 'components/ai-elements', name);

test('mator attachment canvas module exists', () => {
  assert.equal(existsSync(pipeline('mator-attachment-canvas.tsx')), true);
});

test('operator chat panel exposes required mator testids and chrome', () => {
  const source = readFileSync(pipeline('operator-chat-panel.tsx'), 'utf8');
  for (const testid of [
    'mator-chat',
    'mator-conversation-switcher',
    'mator-new-conversation',
    'mator-restore-pipeline',
    'workflow-screenshot',
  ]) {
    assert.match(source, new RegExp(`data-testid="${testid}"`));
  }
  assert.match(source, /framer-motion/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /AnimatePresence/);
  assert.match(source, /MessageScroller/);
  assert.match(source, /MatorClarifyForm/);
  assert.match(source, /MatorAttachmentCanvas/);
  assert.match(
    source,
    /getApi\(\s*'runs\/'/,
    'screenshot evidence links the run API'
  );
  assert.doesNotMatch(source, /Groq capabilities/);
});

test('composer is text-first with voice demoted to a small control', () => {
  const source = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-input"/);
  assert.match(source, /data-testid="mator-send"/);
  assert.match(source, /data-testid="mator-attach"/);
  assert.match(source, /data-testid="mator-mic"/);
  assert.match(source, /data-testid="mator-voice-switch"/);
  assert.match(source, /data-testid="mator-voice-only"/);
  assert.match(source, /Paperclip/);
  assert.match(source, /ATTACH_ACCEPT/);
  assert.match(source, /onAttachFile/);
  assert.match(source, /mator\.voiceOnly/, 'voice-only preference persists');
});

test('retired voice deck does not come back', () => {
  assert.equal(existsSync(pipeline('voice-deck.tsx')), false);
  const composer = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  assert.doesNotMatch(composer, /mator-voice-deck/);
});

test('grow confirmation stage controls live in the ai-elements gate', () => {
  const source = readFileSync(aiElements('confirmation.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-stage-confirm"/);
  assert.match(source, /data-testid="mator-stage-reject"/);
  assert.match(source, /AlertDialog/, 'rejecting asks once more, safely');
});

test('composer carries incomplete and clarify interaction contracts', () => {
  const source = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  assert.match(source, /onIncompleteContinue/);
  assert.match(source, /data-testid="mator-incomplete-continue"/);

  const form = readFileSync(pipeline('mator-clarify-form.tsx'), 'utf8');
  assert.match(form, /data-testid="mator-clarify-form"/);
  assert.match(form, /formatClarifyReply/);
});

test('processable foundation modules exist for the dock', () => {
  for (const file of [
    ui('badge.tsx'),
    ui('avatar.tsx'),
    ui('popover.tsx'),
    ui('skeleton.tsx'),
    ui('switch.tsx'),
    ui('slider.tsx'),
    ui('toast.tsx'),
    ui('alert-dialog.tsx'),
    ui('attachment.tsx'),
    ui('message-scroller.tsx'),
    ui('questionnaire.tsx'),
    aiElements('reasoning.tsx'),
    aiElements('task.tsx'),
    aiElements('checkpoint.tsx'),
    aiElements('confirmation.tsx'),
    aiElements('queue.tsx'),
    aiElements('suggestion.tsx'),
    aiElements('model-selector.tsx'),
    aiElements('plan.tsx'),
  ]) {
    assert.equal(existsSync(file), true, file);
  }
});

test('attachment canvas pins markers with reduced-motion aware motion', () => {
  const source = readFileSync(pipeline('mator-attachment-canvas.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-attachment-canvas"/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /framer-motion/);
  assert.match(source, /onMarkersChange/);
});

test('chat settings expose only real backend knobs', () => {
  const source = readFileSync(pipeline('mator-chat-settings.tsx'), 'utf8');
  assert.match(source, /saveMatorSettings/);
  assert.match(source, /reasoningEffort/);
  assert.match(source, /autoApprove/);
  assert.match(source, /howTtsEnabled/);
  assert.match(source, /moderationEnabled/);
  assert.doesNotMatch(source, /temperature/, 'no invented backend field');
});

test('dashboard shell wires mator chat chrome into the operator panel', () => {
  const shell = readFileSync(
    resolve(root, 'components/dashboard/dashboard-shell.tsx'),
    'utf8'
  );
  assert.match(shell, /matorEvents=\{matorEvents\}/);
  assert.match(shell, /onReject=\{rejectChat\}/);
  assert.match(shell, /onRestorePipeline=/);
  assert.match(shell, /incompleteContinue/);
  assert.match(shell, /attachFile/);
  assert.match(shell, /saveMarkers/);
});

test('incomplete Continue sends Continue via useMatorChat through the composer', () => {
  const hook = readFileSync(pipeline('use-mator-chat.ts'), 'utf8');
  assert.match(hook, /incompleteContinue\s*=\s*useCallback/);
  assert.match(hook, /await send\(['"]Continue['"]\)/);
});
