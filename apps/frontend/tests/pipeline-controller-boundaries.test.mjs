import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'components', 'dashboard');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('pipeline coordinates dedicated controllers rather than owning run transport', () => {
  const page = read('dashboard-shell.tsx');
  const monitor = read('pipeline/use-run-monitor.ts');
  const workspace = read('pipeline/use-workflow-workspace.ts');
  const chat = read('pipeline/use-operator-commands.ts');
  const visual = read('pipeline/use-visual-reviews.ts');
  assert.match(page, /useRunMonitor\(/);
  assert.match(page, /useWorkflowWorkspace\(/);
  assert.match(page, /useOperatorCommands\(/);
  assert.match(page, /useVisualReviews\(/);
  assert.match(page, /<PipelineWorkspace/);
  assert.match(page, /<OperatorChatPanel/);
  assert.match(page, /<CheckpointDialog/);
  assert.doesNotMatch(page, /new EventSource\(/);
  assert.doesNotMatch(page, /fetch\(getApi\('workflows'\)/);
  assert.doesNotMatch(page, /function sendMessage\(/);
  assert.match(monitor, /EventSource\(getApi\('events\/'/);
  assert.match(workspace, /expectedRevision/);
  assert.match(chat, /executeCraftCommand/);
  assert.match(visual, /getApi\('visual-reviews'\)/);
  assert.doesNotMatch(page, /function annotateCapture\(/);
});
