
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from 'vitest';

const root = resolve(import.meta.dirname, '..', 'components', 'dashboard');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('pipeline coordinates dedicated controllers rather than owning run transport', () => {
  const page = read('dashboard-shell.tsx');
  const monitor = read('pipeline/use-run-monitor.ts');
  const workspace = read('pipeline/use-workflow-workspace.ts');
  const chat = read('pipeline/use-operator-commands.ts');
  const visual = read('../mator/use-visual-reviews.ts');
  expect(page).toMatch(/useRunMonitor\(/);
  expect(page).toMatch(/useWorkflowWorkspace\(/);
  expect(page).toMatch(/useMatorChat\(/);
  expect(page).toMatch(/useOperatorCommands\(/);
  expect(page).toMatch(/useVisualReviews\(/);
  expect(page).toMatch(/<PipelineWorkspace/);
  expect(page).toMatch(/<OperatorChatPanel/);
  expect(page).toMatch(/<CheckpointDialog/);
  expect(page).not.toMatch(/new EventSource\(/);
  expect(page).not.toMatch(/fetch\(getApi\('workflows'\)/);
  expect(page).not.toMatch(/function sendMessage\(/);
  expect(monitor).toMatch(/EventSource\(getApi\([`']events\//);
  expect(workspace).toMatch(/expectedRevision/);
  expect(chat).toMatch(/executeCraftCommand/);
  expect(visual).toMatch(/getApi\('visual-reviews'\)/);
  expect(page).not.toMatch(/function annotateCapture\(/);
});
