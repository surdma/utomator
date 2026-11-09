import { expect, test } from 'vitest';
import { defaultWorkflowPlan } from '../modules/pipeline/components/default-workflow-plan.ts';
import {
  appendVisualReviewStep,
  captureSection,
  reviewSection,
  validateReviewImage,
} from '../modules/pipeline/components/visual-review-model.ts';

test('review upload accepts only supported types at the original 2 MiB boundary', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    expect(validateReviewImage({ size: 2 * 1024 * 1024, type })).toEqual(null);
    expect(validateReviewImage({ size: 2 * 1024 * 1024 + 1, type })).toMatch(
      /under 2 MB/,
    );
  }
  expect(validateReviewImage({ size: 10, type: 'image/svg+xml' })).toMatch(
    /PNG/,
  );
});

test('capture and saved page sections stay within the original allowlist', () => {
  expect(captureSection('audit-skills.png')).toEqual('skills');
  expect(captureSection('audit-profile.png')).toEqual(null);
  expect(captureSection('audit-../../skills.png')).toEqual(null);
  expect(reviewSection('https://example.com/in/a/details/projects/')).toEqual(
    'projects',
  );
  expect(reviewSection('https://example.com/in/a')).toEqual('profile');
});

test('tagged review inserts a non-executable note before the action step', () => {
  const before = defaultWorkflowPlan();
  const after = appendVisualReviewStep(before, 'abcdef012345', 3);
  expect(before.steps.length).toEqual(6);
  expect(after.steps.length).toEqual(7);
  expect(after.steps[3].id).toEqual('review-abcdef01');
  expect(after.steps[3].kind).toEqual('note');
  expect(after.steps[3].message).toMatch(/approval still required/);
  expect(after.links.map(({ source, target }) => [source, target])).toEqual(
    after.steps.slice(1).map((step, index) => [after.steps[index].id, step.id]),
  );
});

test('duplicate visual review ID returns the original workflow unchanged', () => {
  const once = appendVisualReviewStep(defaultWorkflowPlan(), 'abcdef012345', 2);
  const twice = appendVisualReviewStep(once, 'abcdef012345', 4);
  expect(twice).toEqual(once);
});
