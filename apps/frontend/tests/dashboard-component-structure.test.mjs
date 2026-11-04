import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const component = (path) => resolve(root, 'components/dashboard', path);

test('dashboard has one routed shell and no obsolete automate component tree', () => {
  assert.equal(existsSync(resolve(root, 'components/automate')), false);
  assert.equal(existsSync(component('dashboard-shell.tsx')), true);
  for (const feature of [
    'career',
    'connections',
    'crafts',
    'editorial',
    'growth',
    'intelligence',
    'pipeline',
    'research',
    'reviews',
    'settings',
    'workflows',
  ]) {
    assert.equal(existsSync(component(feature)), true, feature);
  }
});

test('retired Mator UI modules cannot return without a reference audit', () => {
  assert.equal(existsSync(component('intelligence-studio.tsx')), false);
  assert.equal(existsSync(component('linkedin-growth-hub.tsx')), false);
  assert.equal(existsSync(component('career/section-editor.tsx')), true);
  assert.equal(existsSync(component('workflows/workflow-step-card.tsx')), true);
});

test('dashboard pages consume the shared dashboard shell', () => {
  for (const route of [
    'workspace',
    'settings',
    'growth',
    'history',
    'resumes',
  ]) {
    const page = readFileSync(
      resolve(root, 'app/dashboard', route, 'page.tsx'),
      'utf8',
    );
    assert.match(page, /components\/dashboard\/dashboard-shell/);
    assert.doesNotMatch(page, /components\/automate/);
  }
});

test('mator action chat UI modules ship with required testids', () => {
  const panel = readFileSync(
    component('../mator/operator-chat-panel.tsx'),
    'utf8',
  );
  const composer = readFileSync(
    component('../mator/mator-composer.tsx'),
    'utf8',
  );
  assert.equal(
    existsSync(component('../mator/mator-attachment-canvas.tsx')),
    true,
  );
  assert.match(panel, /data-testid="mator-chat"/);
  assert.match(panel, /data-testid="mator-conversation-switcher"/);
  assert.match(panel, /data-testid="mator-restore-pipeline"/);
  assert.match(composer, /data-testid="mator-input"/);
  assert.match(
    readFileSync(component('../mator/elements/confirmation.tsx'), 'utf8'),
    /data-testid="mator-stage-confirm"/,
  );
  assert.match(
    readFileSync(component('../mator/mator-attachment-canvas.tsx'), 'utf8'),
    /data-testid="mator-attachment-canvas"/,
  );
});

test('one shell-level VisualReviewPanel serves chat and artboard annotation', () => {
  const shell = readFileSync(component('dashboard-shell.tsx'), 'utf8');
  const visualReviews = readFileSync(
    component('../mator/use-visual-reviews.ts'),
    'utf8',
  );
  const panel = readFileSync(
    component('reviews/visual-review-panel.tsx'),
    'utf8',
  );

  assert.equal(
    (shell.match(/<VisualReviewPanel/g) || []).length,
    1,
    'the shell owns exactly one annotation studio instance',
  );
  assert.match(
    shell,
    /onClose=\{closeImageDraft\}/,
    'dismiss resolves honestly',
  );

  assert.match(
    visualReviews,
    /ChatAnnotationResult/,
    'the annotate flow reports the created review',
  );
  assert.match(visualReviews, /annotateChatAsset/);
  assert.match(visualReviews, /chatAnnotationResolver/);
  assert.match(
    visualReviews,
    /resolve\(null\)/,
    'a dismissed studio never fabricates a saved review',
  );

  assert.match(shell, /annotateMatorDraft/);
  assert.match(shell, /annotateMatorAttachment/);
  assert.match(shell, /annotateChatImage/);
  const chatPanel = readFileSync(
    component('../mator/operator-chat-panel.tsx'),
    'utf8',
  );
  assert.match(chatPanel, /annotateChatImageAvailable/);
  assert.match(
    chatPanel,
    /onAnnotateDraft && annotateChatImageAvailable \? onAnnotateDraft : undefined/,
    'studio entries are gated on an active pipeline page context',
  );

  assert.match(
    panel,
    /Circle|Rectangle|Draw/,
    'the restored studio keeps the full shape toolbar',
  );
});

test('the workflow annotation dialog offers a clone-mode annotate entry', () => {
  const dialog = readFileSync(
    component('workflows/workflow-artboard-annotation-dialog.tsx'),
    'utf8',
  );
  const artboard = readFileSync(
    component('workflows/workflow-artboard.tsx'),
    'utf8',
  );
  assert.match(dialog, /data-testid="workflow-annotation-annotate-further"/);
  assert.match(dialog, /onAnnotateFurther/);
  assert.match(
    artboard,
    /onAnnotateFurther/,
    'the artboard threads the clone-mode handler to the dialog',
  );
});
