import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultWorkflowPlan,
  newWorkflowDraft,
} from '../components/dashboard/pipeline/default-workflow-plan.ts';

test('default profile audit has its original connected execution sequence', () => {
  const plan = defaultWorkflowPlan();
  assert.equal(plan.platform, 'linkedin');
  assert.equal(plan.action, 'audit');
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['start', 'session', 'inspect', 'action', 'verify', 'finish']
  );
  assert.deepEqual(
    plan.links.map((link) => [link.source, link.target]),
    [
      ['start', 'session'],
      ['session', 'inspect'],
      ['inspect', 'action'],
      ['action', 'verify'],
      ['verify', 'finish'],
    ]
  );
});

test('separate workspace initializations do not share mutable plan arrays', () => {
  const one = defaultWorkflowPlan();
  const two = defaultWorkflowPlan();
  assert.notEqual(one, two);
  assert.notEqual(one.steps, two.steps);
  assert.notEqual(one.links, two.links);
});

test('a new user-created workflow has only the four validated protected steps', () => {
  for (const platform of ['linkedin', 'x']) {
    const draft = newWorkflowDraft(platform);
    assert.equal(draft.platform, platform);
    assert.equal(draft.action, 'audit');
    assert.equal(draft.name, 'Untitled workflow');
    assert.deepEqual(
      draft.steps.map((step) => step.id),
      ['start', 'session', 'action', 'finish']
    );
    assert.deepEqual(
      draft.links.map((link) => [link.source, link.target]),
      [
        ['start', 'session'],
        ['session', 'action'],
        ['action', 'finish'],
      ]
    );
    assert.notEqual(draft, newWorkflowDraft(platform));
  }
});
