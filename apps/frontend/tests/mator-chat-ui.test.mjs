import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const mator = (name) => resolve(root, 'modules/mator/components', name);
const ui = (name) => resolve(root, 'components/ui', name);
const aiElements = (name) =>
  resolve(root, 'modules/mator/components/elements', name);

test('image thumbnail opens annotation studio on click', () => {
  const preview = readFileSync(mator('mator-attachment-preview.tsx'), 'utf8');
  expect(preview).toMatch(/data-testid="mator-image-thumbnail"/);
  expect(preview).toMatch(/onAnnotateFull/);
  expect(preview).not.toMatch(/mator-annotation-pencil|Open original image/);
  expect(preview).toMatch(/StudioDialog|mator-image-annotation-modal/);
  expect(preview).toMatch(/MatorAttachmentCanvas/);
  expect(preview).toMatch(/onMarkersChange/);
  expect(preview).toMatch(/onAnnotateFull/);
});

test('chat images offer the full YAML-driven annotation studio', () => {
  const preview = readFileSync(mator('mator-attachment-preview.tsx'), 'utf8');
  // Image click itself opens the full annotation studio (no separate pencil button).
  expect(preview).toMatch(/onAnnotateFull/);
  expect(preview).not.toMatch(/mator-annotation-full-pencil/);
  // Linked saved reviews expose the annotation YAML directly.
  expect(preview).toMatch(/data-testid="mator-annotation-yaml-link"/);
  expect(preview).toMatch(/reviewId/);
  expect(preview).toMatch(/visual-reviews\/\$\{reviewId\}/);
});

test('mator attachment canvas module exists', () => {
  assert.equal(existsSync(mator('mator-attachment-canvas.tsx')), true);
});

test('operator chat panel exposes required mator testids and chrome', () => {
  const source = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
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
  assert.doesNotMatch(
    source,
    /data-testid="mator-voice-switch"/,
    'header no longer owns the voice switch',
  );
  assert.match(
    source,
    /defaultScrollPosition="end"/,
    'the chat opens at the live edge',
  );
  assert.match(source, /orderedMatorEvents/);
  assert.match(
    source,
    /getApi\(['"\x60]runs\//,
    'screenshot evidence links the run API',
  );
  assert.doesNotMatch(source, /Groq capabilities/);
});

test('composer is text-first with voice demoted to a small control', () => {
  const source = readFileSync(mator('mator-composer.tsx'), 'utf8');
  assert.match(source, /data-testid="mator-input"/);
  assert.match(source, /data-testid="mator-send"/);
  assert.match(source, /data-testid="mator-attach"/);
  assert.match(source, /data-testid="mator-mic"/);
  assert.match(
    source,
    /data-testid="mator-voice-switch"/,
    'composer owns the voice-only toggle',
  );
  assert.match(
    source,
    /MatorChatSettings/,
    'chat configuration is reachable from the composer',
  );
  assert.match(
    source,
    /onSettingsSaved/,
    'composer settings notify the active Mator state',
  );
  assert.match(source, /flex-nowrap/, 'composer actions remain on one row');
  assert.match(source, /Paperclip/);
  assert.match(source, /ATTACH_ACCEPT/);
  assert.match(source, /onUploadFile/);
  assert.match(source, /multiple/);
  assert.match(source, /mator-pending-gallery/);
  const preference = readFileSync(mator('mator-voice-preference.ts'), 'utf8');
  assert.match(
    preference,
    /mator\.voiceOnly/,
    'voice-only preference persists',
  );
  assert.match(
    preference,
    /useSyncExternalStore/,
    'text and voice decks share the same persisted preference',
  );
});

test('pending drafts annotate through the YAML studio and fail honestly', () => {
  const composer = readFileSync(mator('mator-composer.tsx'), 'utf8');
  assert.match(
    composer,
    /onAnnotateDraft/,
    'pending drafts reach the shell studio',
  );
  expect(composer).toMatch(/reviewId/);
  expect(composer).toMatch(/data-testid="mator-annotate-error"/);
});

test('new chat displays suggestions instead of a permanent loading skeleton', () => {
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  expect(panel).toMatch(/data-testid="mator-empty-thread"/);
  expect(panel).toMatch(/loading \? \(/);
  expect(panel).toMatch(/<Suggestion[^>]*?suggestions=\{START_SUGGESTIONS\}/s);
  expect(panel).toMatch(/matorAttachmentFileUrl/);
  const attachment = readFileSync(
    mator('mator-attachment-preview.tsx'),
    'utf8',
  );
  expect(attachment).toMatch(/onAnnotateFull/);
});

test('model picker is connected to real chat settings and handles failures', () => {
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  const settings = readFileSync(mator('mator-chat-settings.tsx'), 'utf8');
  expect(panel).toMatch(/fetchMatorModels/);
  expect(panel).toMatch(/models=\{models\}/);
  expect(panel).toMatch(/onModelChange=\{/);
  expect(shell).toMatch(/modelId=\{settingsToggles\.modelId/);
  expect(shell).toMatch(/patchSettings\(\{ modelId \}\)/);
  expect(settings).toMatch(/EFFORT_STOPS = \['low', 'medium', 'high'\]/);
  expect(settings).toMatch(/Retry loading settings/);
});

test('attachment upload failures remain visible in the composer', () => {
  const composer = readFileSync(mator('mator-composer.tsx'), 'utf8');
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  expect(composer).toMatch(/if \(!id\) throw Error/);
  expect(composer).toMatch(/setDraftError/);
  expect(shell).toMatch(/onPendingAssetsChange/);
});

test('composer never duplicates a staged action approval card', () => {
  const source = readFileSync(mator('mator-composer.tsx'), 'utf8');
  expect(source).not.toMatch(/mator-stage-confirm-compact/);
  expect(source).not.toMatch(/Not staged/);
});

test('Mator keeps latest replies at the live edge instead of anchoring them at the viewport top', () => {
  const source = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  expect(source).toMatch(/defaultScrollPosition="end"/);
  expect(source).not.toMatch(/lastMatorEventId/);
  expect(source).not.toMatch(/anchor=\{event\.id ===/);
  expect(source).not.toMatch(/scrollAnchor=\{item\.id ===/);
});

test('legacy local command approval stays available without duplicating Mator stages', () => {
  const composer = readFileSync(mator('mator-composer.tsx'), 'utf8');
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  expect(composer).toMatch(/data-testid="operator-pending-approval"/);
  expect(composer).toMatch(/data-testid="operator-confirm-pending"/);
  expect(panel).toMatch(/onConfirmOperator=\{onConfirmOperator\}/);
  expect(shell).toMatch(/onConfirmOperator=\{confirmPending\}/);
  expect(shell).toMatch(/pendingLabel: operatorPendingLabel/);
  expect(composer).not.toMatch(/mator-stage-confirm-compact/);
});

test('asset upload requires explicit send and multi-image names are metadata', () => {
  const composer = readFileSync(mator('mator-composer.tsx'), 'utf8');
  const hook = readFileSync(mator('use-mator-chat.ts'), 'utf8');
  const panel = readFileSync(mator('operator-chat-panel.tsx'), 'utf8');
  expect(composer).toMatch(/accepted\.map/);
  expect(composer).toMatch(/onSendText\(message\.trim\(\), ids\)/);
  expect(composer).toMatch(/mator-pending-gallery/);
  expect(hook).not.toMatch(/send\(file\.name, \[uploaded\.id\]\)/);
  expect(panel).toMatch(/mator-image-gallery/);
  expect(panel).toMatch(/assets\.map/);
});
test('text dictation stays in the draft and AI Call requires an explicit start', () => {
  const shell = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  const composer = readFileSync(mator('mator-composer.tsx'), 'utf8');
  const listener = readFileSync(mator('mator-voice-listener.tsx'), 'utf8');
  expect(shell).toMatch(/if \(source === 'voice'\) \{/);
  expect(shell).toMatch(
    /\[current\.trim\(\), request\]\.filter\(Boolean\)\.join\(' '\)/,
  );
  expect(shell).toMatch(/const aiCall = useMatorAiCall\(/);
  expect(composer).toMatch(/<MatorVoiceListener call=\{call\}/);
  expect(listener).toMatch(/data-testid="mator-call-start"/);
  expect(listener).toMatch(/onClick=\{call\.start\}/);
  expect(listener).toMatch(/mator-galaxy/);
  expect(listener).not.toMatch(/mator-call-last-turn/);
});
