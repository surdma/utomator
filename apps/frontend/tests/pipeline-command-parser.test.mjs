import { expect, test } from 'vitest';
import { explainCommand } from '../modules/pipeline/components/command-parser.ts';
import { workflows } from '../modules/pipeline/components/workflow-catalog.ts';

test('workflow catalogue keeps supported audited and approved operations', () => {
  expect(
    workflows.linkedin.some((workflow) => workflow.id === 'audit'),
  ).toBeTruthy();
  expect(
    workflows.linkedin.some((workflow) => workflow.id === 'edit-profile'),
  ).toBeTruthy();
  expect(
    workflows.x.some((workflow) => workflow.id === 'compose-post'),
  ).toBeTruthy();
});

test('command parser prepares an audit without launching it', () => {
  const result = explainCommand('audit my profile');
  expect(result?.action).toEqual('audit');
  expect(result?.fields).toEqual({});
  expect(result?.note ?? '').toMatch(/Start the run/);
});

test('command parser preserves text and requires explicit approval', () => {
  const headline = explainCommand('update my headline: Clinical Systems Lead');
  expect(headline?.fields.headline).toEqual('Clinical Systems Lead');
  const post = explainCommand('compose post: New research published');
  expect(post?.fields.postText).toEqual('New research published');
  expect(post?.note ?? '').toMatch(/explicit approval/);
  expect(explainCommand('launch everything')).toEqual(null);
});
