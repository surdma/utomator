import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const component = (feature, file = '') =>
  resolve(root, 'modules', feature, 'components', file);

test('dashboard has one routed shell and no obsolete automate component tree', () => {
  expect(existsSync(resolve(root, 'components/automate'))).toEqual(false);
  expect(existsSync(component('shell', 'dashboard-shell.tsx'))).toEqual(true);
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
    expect(existsSync(component(feature))).toEqual(true);
  }
});

test('retired Mator UI modules cannot return without a reference audit', () => {
  expect(existsSync(component('career', 'intelligence-studio.tsx'))).toEqual(
    false,
  );
  expect(existsSync(component('growth', 'linkedin-growth-hub.tsx'))).toEqual(
    false,
  );
  expect(existsSync(component('career', 'section-editor.tsx'))).toEqual(true);
  expect(existsSync(component('workflows', 'workflow-step-card.tsx'))).toEqual(
    true,
  );
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
    expect(page).toMatch(/modules\/shell/);
    expect(page).not.toMatch(/components\/automate/);
  }
});

test('mator action chat UI modules ship with required testids', () => {
  const panel = readFileSync(
    component('mator', 'operator-chat-panel.tsx'),
    'utf8',
  );
  const composer = readFileSync(
    component('mator', 'mator-composer.tsx'),
    'utf8',
  );
  expect(existsSync(component('mator', 'mator-attachment-canvas.tsx'))).toEqual(
    true,
  );
  expect(panel).toMatch(/data-testid="mator-chat"/);
  expect(panel).toMatch(/data-testid="mator-conversation-switcher"/);
  expect(panel).toMatch(/data-testid="mator-restore-pipeline"/);
  expect(composer).toMatch(/data-testid="mator-input"/);
  expect(
    readFileSync(component('mator', 'elements/confirmation.tsx'), 'utf8'),
  ).toMatch(/data-testid="mator-stage-confirm"/);
  expect(
    readFileSync(component('mator', 'mator-attachment-canvas.tsx'), 'utf8'),
  ).toMatch(/data-testid="mator-attachment-canvas"/);
});

test('one shell-level VisualReviewPanel serves chat and artboard annotation', () => {
  const shell = readFileSync(component('shell', 'dashboard-shell.tsx'), 'utf8');
  const visualReviews = readFileSync(
    component('mator', 'use-visual-reviews.ts'),
    'utf8',
  );
  const panel = readFileSync(
    component('reviews', 'visual-review-panel.tsx'),
    'utf8',
  );

  expect((shell.match(/<VisualReviewPanel/g) || []).length).toEqual(1);
  expect(shell).toMatch(/onClose=\{closeImageDraft\}/);

  expect(visualReviews).toMatch(/ChatAnnotationResult/);
  expect(visualReviews).toMatch(/annotateChatAsset/);
  expect(visualReviews).toMatch(/chatAnnotationResolver/);
  expect(visualReviews).toMatch(/resolve\(null\)/);

  expect(shell).toMatch(/annotateMatorDraft/);
  expect(shell).toMatch(/annotateMatorAttachment/);
  expect(shell).toMatch(/annotateChatImage/);
  const chatPanel = readFileSync(
    component('mator', 'operator-chat-panel.tsx'),
    'utf8',
  );
  expect(chatPanel).toMatch(/annotateChatImageAvailable/);
  expect(chatPanel).toMatch(
    /onAnnotateDraft\s*&&\s*annotateChatImageAvailable\s*\?\s*onAnnotateDraft/,
  );

  expect(panel).toMatch(/Circle|Rectangle|Draw/);
});

test('the workflow annotation dialog offers a clone-mode annotate entry', () => {
  const dialog = readFileSync(
    component('workflows', 'workflow-artboard-annotation-dialog.tsx'),
    'utf8',
  );
  const artboard = readFileSync(
    component('workflows', 'workflow-artboard.tsx'),
    'utf8',
  );
  expect(dialog).toMatch(/data-testid="workflow-annotation-annotate-further"/);
  expect(dialog).toMatch(/onAnnotateFurther/);
  expect(artboard).toMatch(/onAnnotateFurther/);
});
