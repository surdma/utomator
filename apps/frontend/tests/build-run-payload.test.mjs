import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRunPayload } from '../components/dashboard/pipeline/build-run-payload.ts';

const base = () => ({
  loadingWorkflow: false,
  activeWorkflow: null,
  planDirty: false,
  formDirty: false,
  activeConnector: {
    id: 'account-1',
    status: 'connected',
    platform: 'linkedin',
    profileUrl: 'https://www.linkedin.com/in/owner',
  },
  platform: 'linkedin',
  action: 'audit',
  workflowPlan: {
    version: 1,
    platform: 'linkedin',
    action: 'audit',
    name: 'Audit',
    steps: [],
    links: [],
  },
  form: {},
  selectedPage: 'https://www.linkedin.com/in/owner/details/experience/',
  fields: [],
});

test('run payload requires a verified matching account', () => {
  assert.throws(
    () => buildRunPayload({ ...base(), activeConnector: null }),
    /Select and verify/,
  );
  assert.throws(
    () =>
      buildRunPayload({
        ...base(),
        activeConnector: { ...base().activeConnector, platform: 'x' },
      }),
    /Select and verify/,
  );
});

test('run payload blocks stale workflow revisions', () => {
  assert.throws(
    () => buildRunPayload({ ...base(), loadingWorkflow: true }),
    /not finished loading/,
  );
  assert.throws(
    () =>
      buildRunPayload({
        ...base(),
        activeWorkflow: { id: 'saved', revision: 4 },
        planDirty: true,
      }),
    /Save workflow changes/,
  );
  assert.throws(
    () =>
      buildRunPayload({
        ...base(),
        activeWorkflow: { id: 'saved', revision: 4 },
        formDirty: true,
      }),
    /Save workflow changes/,
  );
});

test('run payload retains field validation and page scope', () => {
  const extra = {
    ...base(),
    action: 'audit-page',
    fields: [{ key: 'websiteIndex', label: 'Website index', required: true }],
  };
  assert.throws(() => buildRunPayload(extra), /Website index is required/);
  const payload = buildRunPayload({
    ...extra,
    form: { websiteIndex: ' 3 ' },
  });
  assert.equal(payload.websiteIndex, 3);
  assert.equal(payload.pageUrl, extra.selectedPage);
  assert.equal(payload.accountId, 'account-1');
});

test('run payload pins saved revisions and preserves new parameters', () => {
  const saved = buildRunPayload({
    ...base(),
    activeWorkflow: { id: 'saved', revision: 4 },
  });
  assert.equal(saved.workflowId, 'saved');
  assert.equal(saved.workflowRevision, 4);
  assert.equal('workflow' in saved, false);
  const newRun = buildRunPayload({
    ...base(),
    form: { headline: 'New title' },
  });
  assert.deepEqual(newRun.workflow.parameters, { headline: 'New title' });
  assert.equal('workflowRevision' in newRun, false);
});
