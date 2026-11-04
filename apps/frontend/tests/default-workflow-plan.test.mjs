
import { test, expect } from 'vitest';
import {
  defaultWorkflowPlan,
  newWorkflowDraft,
} from '../components/dashboard/pipeline/default-workflow-plan.ts';

test('default profile audit has its original connected execution sequence', () => {
  const plan = defaultWorkflowPlan();
  expect(plan.platform).toEqual('linkedin');
  expect(plan.action).toEqual('audit');
  expect(plan.steps.map((step) => step.id)).toEqual(['start', 'session', 'inspect', 'action', 'verify', 'finish']);
  expect(plan.links.map((link) => [link.source, link.target])).toEqual([
      ['start', 'session'],
      ['session', 'inspect'],
      ['inspect', 'action'],
      ['action', 'verify'],
      ['verify', 'finish'],
    ]);
});

test('separate workspace initializations do not share mutable plan arrays', () => {
  const one = defaultWorkflowPlan();
  const two = defaultWorkflowPlan();
  expect(one).not.toEqual(two);
  expect(one.steps).not.toEqual(two.steps);
  expect(one.links).not.toEqual(two.links);
});

test('a new user-created workflow has only the four validated protected steps', () => {
  for (const platform of ['linkedin', 'x']) {
    const draft = newWorkflowDraft(platform);
    expect(draft.platform).toEqual(platform);
    expect(draft.action).toEqual('audit');
    expect(draft.name).toEqual('Untitled workflow');
    expect(draft.steps.map((step) => step.id)).toEqual(['start', 'session', 'action', 'finish']);
    expect(draft.links.map((link) => [link.source, link.target])).toEqual([
        ['start', 'session'],
        ['session', 'action'],
        ['action', 'finish'],
      ]);
    expect(draft).not.toEqual(newWorkflowDraft(platform));
  }
});
