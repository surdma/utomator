import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainCommand } from '../components/dashboard/pipeline/command-parser.ts';
import { workflows } from '../components/dashboard/pipeline/workflow-catalog.ts';

test('workflow catalogue keeps supported audited and approved operations', () => {
  assert.ok(workflows.linkedin.some((workflow) => workflow.id === 'audit'));
  assert.ok(
    workflows.linkedin.some((workflow) => workflow.id === 'edit-profile')
  );
  assert.ok(workflows.x.some((workflow) => workflow.id === 'compose-post'));
});

test('command parser prepares an audit without launching it', () => {
  const result = explainCommand('audit my profile');
  assert.equal(result?.action, 'audit');
  assert.deepEqual(result?.fields, {});
  assert.match(result?.note ?? '', /Start the run/);
});

test('command parser preserves text and requires explicit approval', () => {
  const headline = explainCommand('update my headline: Clinical Systems Lead');
  assert.equal(headline?.fields.headline, 'Clinical Systems Lead');
  const post = explainCommand('compose post: New research published');
  assert.equal(post?.fields.postText, 'New research published');
  assert.match(post?.note ?? '', /explicit approval/);
  assert.equal(explainCommand('launch everything'), null);
});
