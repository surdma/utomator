import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const pipeline = (name) => resolve(root, 'components/dashboard/pipeline', name);
const ui = (name) => resolve(root, 'components/ui', name);
const aiElements = (name) => resolve(root, 'components/ai-elements', name);

test('annotation is opt-in using an accessible pencil control', () => {
  const preview = readFileSync(pipeline('mator-attachment-preview.tsx'), 'utf8');
  assert.match(preview, /data-testid="mator-annotation-pencil"/);
  assert.match(preview, /aria-expanded/);
  assert.match(preview, /MatorAttachmentCanvas/);
  assert.match(preview, /onMarkersChange/);
});

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
  assert.match(source, /MatorAttachmentPreview/);
  assert.doesNotMatch(source, /data-testid="mator-voice-switch"/, 'header no longer owns the voice switch');
  assert.match(source, /defaultScrollPosition="end"/, 'the chat opens at the live edge');
  assert.match(source, /orderedMatorEvents/);
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
  assert.match(source, /data-testid="mator-voice-switch"/, 'composer owns the voice-only toggle');
  assert.match(source, /MatorChatSettings/, 'chat configuration is reachable from the composer');
  assert.match(source, /onSettingsSaved/, 'composer settings notify the active Mator state');
  assert.match(source, /flex-nowrap/, 'composer actions remain on one row');
  assert.match(source, /Paperclip/);
  assert.match(source, /ATTACH_ACCEPT/);
  assert.match(source, /onAttachFile/);
  const preference = readFileSync(pipeline('mator-voice-preference.ts'), 'utf8');
  assert.match(preference, /mator\.voiceOnly/, 'voice-only preference persists');
  assert.match(preference, /useSyncExternalStore/, 'text and voice decks share the same persisted preference');
});

test('retired voice deck does not come back', () => {
  assert.equal(existsSync(pipeline('voice-deck.tsx')), false);
  const composer = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  assert.doesNotMatch(composer, /mator-voice-deck/);
});

test('inline chat model selector stays icon-only inside a narrow dock', () => {
  const selector = readFileSync(aiElements('model-selector.tsx'), 'utf8');
  assert.match(selector, /compact && 'hidden'/);
  assert.doesNotMatch(selector, /compact && 'hidden min-\[420px\]:inline'/);
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
  assert.match(form, /onUploadFile/);
  assert.match(form, /inputType === 'file'/);
  assert.match(form, /inputType === 'url'/);
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


test('new chat displays suggestions instead of a permanent loading skeleton', () => {
  const panel = readFileSync(pipeline('operator-chat-panel.tsx'), 'utf8');
  assert.match(panel, /data-testid="mator-empty-thread"/);
  assert.match(panel, /loading \? \(/);
  assert.match(panel, /<Suggestion suggestions=\{START_SUGGESTIONS\}/);
  assert.match(panel, /matorAttachmentFileUrl/);
  const attachment = readFileSync(pipeline('mator-attachment-preview.tsx'), 'utf8');
  assert.match(attachment, /Open attached file/, 'original assets remain linked from the preview');
});

test('model picker is connected to real chat settings and handles failures', () => {
  const panel = readFileSync(pipeline('operator-chat-panel.tsx'), 'utf8');
  const shell = readFileSync(resolve(root, 'components/dashboard/dashboard-shell.tsx'), 'utf8');
  const settings = readFileSync(pipeline('mator-chat-settings.tsx'), 'utf8');
  assert.match(panel, /fetchMatorModels/);
  assert.match(panel, /models=\{models\}/);
  assert.match(panel, /onModelChange=\{/);
  assert.match(shell, /modelId=\{settingsToggles\.modelId/);
  assert.match(shell, /patchSettings\(\{ modelId \}\)/);
  assert.match(settings, /EFFORT_STOPS = \['low', 'medium', 'high'\]/);
  assert.match(settings, /Retry loading settings/);
});

test('attachment upload failures remain visible in the composer', () => {
  const composer = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  const shell = readFileSync(resolve(root, 'components/dashboard/dashboard-shell.tsx'), 'utf8');
  assert.match(composer, /if \(result === null\) throw new Error/);
  assert.match(shell, /return attachFile\(file\)/);
});


test('composer never duplicates a staged action approval card', () => {
  const source = readFileSync(pipeline('mator-composer.tsx'), 'utf8');
  assert.doesNotMatch(source, /mator-stage-confirm-compact/);
  assert.doesNotMatch(source, /Not staged/);
});

test('Mator keeps latest replies at the live edge instead of anchoring them at the viewport top', () => {
  const source = readFileSync(pipeline('operator-chat-panel.tsx'), 'utf8');
  assert.match(source, /defaultScrollPosition="end"/);
  assert.doesNotMatch(source, /lastMatorEventId/);
  assert.doesNotMatch(source, /anchor=\{event\.id ===/);
  assert.doesNotMatch(source, /scrollAnchor=\{item\.id ===/);
});
