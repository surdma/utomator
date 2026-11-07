import { expect, test } from 'vitest';
import {
  defaultWorkflowPlan,
  newWorkflowDraft,
} from '../modules/pipeline/components/default-workflow-plan.ts';

test('default profile audit has its original connected execution sequence', () => {
  const plan = defaultWorkflowPlan();
  expect(plan.platform).toEqual('linkedin');
  expect(plan.action).toEqual('audit');
  expect(plan.steps.map((step) => step.id)).toEqual([
    'start',
    'session',
    'inspect',
    'action',
    'verify',
    'finish',
  ]);
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
  expect(one).not.toBe(two);
  expect(one.steps).not.toBe(two.steps);
  expect(one.links).not.toBe(two.links);
  const originalTitle = two.steps[0].title;
  one.steps[0].title = 'Changed in the first workspace';
  expect(two.steps[0].title).toBe(originalTitle);
});

test('a new user-created workflow has only the four validated protected steps', () => {
  for (const platform of ['linkedin', 'x']) {
    const draft = newWorkflowDraft(platform);
    expect(draft.platform).toEqual(platform);
    expect(draft.action).toEqual('audit');
    expect(draft.name).toEqual('Untitled workflow');
    expect(draft.steps.map((step) => step.id)).toEqual([
      'start',
      'session',
      'action',
      'finish',
    ]);
    expect(draft.links.map((link) => [link.source, link.target])).toEqual([
      ['start', 'session'],
      ['session', 'action'],
      ['action', 'finish'],
    ]);
    const other = newWorkflowDraft(platform);
    expect(draft).not.toBe(other);
    expect(draft.steps).not.toBe(other.steps);
    expect(draft.links).not.toBe(other.links);
    draft.steps[0].title = 'Local edit';
    expect(other.steps[0].title).toBe('Start workflow');
  }
});
