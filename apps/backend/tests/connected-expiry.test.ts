import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import { execute, type WorkflowContext } from '../src/workflows/execute.js';

test('expired connected sessions fail fast and never request an in-run password or approval', async () => {
  let navigationCount = 0;
  let approvalCount = 0;
  const page = {
    url: () => 'https://www.linkedin.com/checkpoint/',
    goto: async () => { navigationCount += 1; },
  } as unknown as Page;
  const context: WorkflowContext = {
    page,
    input: {
      platform: 'linkedin', action: 'audit',
      profileUrl: 'https://www.linkedin.com/in/connector-owner/',
      accountId: '00000000-0000-4000-8000-000000000001',
    },
    profile: new URL('https://www.linkedin.com/in/connector-owner/'),
    runId: 'test-expired-connection',
    signal: new AbortController().signal,
    emit: () => {},
    approve: async () => { approvalCount += 1; },
    ask: async () => { throw Error('Connected runs should not ask for credentials'); },
  };
  await assert.rejects(
    execute(context),
    /Not authenticated: connected account session expired\. Reconnect and sync/,
  );
  assert.equal(navigationCount, 1, 'expired session is not repeatedly navigated');
  assert.equal(approvalCount, 0, 'connected workflow must not fall back to manual login');
});
