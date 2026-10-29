import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultWorkflowPlan } from '../components/dashboard/pipeline/default-workflow-plan.ts';
import {
  appendVisualReviewStep,
  captureSection,
  reviewSection,
  validateReviewImage,
} from '../components/dashboard/pipeline/visual-review-model.ts';

test('review upload accepts only supported types at the original 2 MiB boundary', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.equal(validateReviewImage({ size: 2 * 1024 * 1024, type }), null);
    assert.match(
      validateReviewImage({ size: 2 * 1024 * 1024 + 1, type }),
      /under 2 MB/
    );
  }
  assert.match(
    validateReviewImage({ size: 10, type: 'image/svg+xml' }),
    /PNG, JPEG or WebP/
  );
});

test('capture and saved page sections stay within the original allowlist', () => {
  assert.equal(captureSection('audit-skills.png'), 'skills');
  assert.equal(captureSection('audit-profile.png'), null);
  assert.equal(captureSection('audit-../../skills.png'), null);
  assert.equal(
    reviewSection('https://example.com/in/a/details/projects/'),
    'projects'
  );
  assert.equal(reviewSection('https://example.com/in/a'), 'profile');
});

test('tagged review inserts a non-executable note before the action step', () => {
  const before = defaultWorkflowPlan();
  const after = appendVisualReviewStep(before, 'abcdef012345', 3);
  assert.equal(before.steps.length, 6);
  assert.equal(after.steps.length, 7);
  assert.equal(after.steps[3].id, 'review-abcdef01');
  assert.equal(after.steps[3].kind, 'note');
  assert.match(after.steps[3].message, /approval still required/);
  assert.deepEqual(
    after.links.map(({ source, target }) => [source, target]),
    after.steps.slice(1).map((step, index) => [after.steps[index].id, step.id])
  );
});

test('duplicate visual review ID returns the original workflow unchanged', () => {
  const once = appendVisualReviewStep(defaultWorkflowPlan(), 'abcdef012345', 2);
  const twice = appendVisualReviewStep(once, 'abcdef012345', 4);
  assert.equal(twice, once);
});
