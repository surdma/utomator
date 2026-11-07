import { expect, test } from 'vitest';
import { buildRunPayload } from '../modules/pipeline/components/build-run-payload.ts';

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
  expect(() => buildRunPayload({ ...base(), activeConnector: null })).toThrow(
    /Select and verify/,
  );
  expect(() =>
    buildRunPayload({
      ...base(),
      activeConnector: { ...base().activeConnector, platform: 'x' },
    }),
  ).toThrow(/Select and verify/);
});

test('run payload blocks stale workflow revisions', () => {
  expect(() => buildRunPayload({ ...base(), loadingWorkflow: true })).toThrow(
    /not finished loading/,
  );
  expect(() =>
    buildRunPayload({
      ...base(),
      activeWorkflow: { id: 'saved', revision: 4 },
      planDirty: true,
    }),
  ).toThrow(/Save workflow changes/);
  expect(() =>
    buildRunPayload({
      ...base(),
      activeWorkflow: { id: 'saved', revision: 4 },
      formDirty: true,
    }),
  ).toThrow(/Save workflow changes/);
});

test('run payload retains field validation and page scope', () => {
  const extra = {
    ...base(),
    action: 'audit-page',
    fields: [{ key: 'websiteIndex', label: 'Website index', required: true }],
  };
  expect(() => buildRunPayload(extra)).toThrow(/Website index is required/);
  const payload = buildRunPayload({
    ...extra,
    form: { websiteIndex: ' 3 ' },
  });
  expect(payload.websiteIndex).toEqual(3);
  expect(payload.pageUrl).toEqual(extra.selectedPage);
  expect(payload.accountId).toEqual('account-1');
});

test('run payload pins saved revisions and preserves new parameters', () => {
  const saved = buildRunPayload({
    ...base(),
    activeWorkflow: { id: 'saved', revision: 4 },
  });
  expect(saved.workflowId).toEqual('saved');
  expect(saved.workflowRevision).toEqual(4);
  expect('workflow' in saved).toEqual(false);
  const newRun = buildRunPayload({
    ...base(),
    form: { headline: 'New title' },
  });
  expect(newRun.workflow.parameters).toEqual({ headline: 'New title' });
  expect('workflowRevision' in newRun).toEqual(false);
});
