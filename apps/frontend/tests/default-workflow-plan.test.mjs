import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultWorkflowPlan } from '../components/dashboard/pipeline/default-workflow-plan.ts';

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
