import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('pipeline coordinates dedicated controllers rather than owning run transport', () => {
  const page = read('modules/shell/components/dashboard-shell.tsx');
  const monitor = read('modules/pipeline/components/use-run-monitor.ts');
  const workspace = read(
    'modules/pipeline/components/use-workflow-workspace.ts',
  );
  const chat = read('modules/pipeline/components/use-operator-commands.ts');
  const visual = read('modules/mator/components/use-visual-reviews.ts');
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
