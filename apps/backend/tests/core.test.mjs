import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRun,
  validateProfileUrl,
  validatePostUrl,
  profileUrlForHandle,
} from '../src/core/validate.ts';
import { EventJournal } from '../src/core/events.ts';
import { ApprovalGate } from '../src/runs/approvals.ts';

const linkedIn = 'https://www.linkedin.com/in/surdma/';
const x = 'https://x.com/surdma';

test('only legitimate direct profile URLs are accepted', () => {
  assert.equal(validateProfileUrl('linkedin', linkedIn).pathname, '/in/surdma/');
  assert.equal(validateProfileUrl('x', x).pathname, '/surdma');
  for (const bad of [
    'http://x.com/surdma',
    'https://x.com.evil.test/surdma',
    'https://x.com/surdma/settings',
    'https://evil.test',
  ]) {
    assert.throws(() => validateProfileUrl('x', bad));
  }
});
test('platform capabilities and required fields are enforced', () => {
  assert.doesNotThrow(() =>
    validateRun({ platform: 'linkedin', action: 'audit', profileUrl: linkedIn }),
  );
  assert.throws(() =>
    validateRun({ platform: 'linkedin', action: 'delete-post', profileUrl: linkedIn }),
  );
  assert.throws(() => validateRun({ platform: 'x', action: 'edit-profile', profileUrl: x }));
  assert.throws(() =>
    validateRun({ platform: 'linkedin', action: 'add-skill', profileUrl: linkedIn, skill: ' ' }),
  );
  assert.throws(() =>
    validateRun({ platform: 'x', action: 'compose-post', profileUrl: x, postText: 'x'.repeat(281) }),
  );
});
test('destructive post URLs cannot target a different account', () => {
  assert.equal(
    validatePostUrl(new URL(x), 'https://x.com/surdma/status/123').pathname,
    '/surdma/status/123',
  );
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com/someone/status/123'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com/surdma/status/123?delete=yes'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com:8443/surdma/status/123'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://other@x.com/surdma/status/123'));
});
test('event IDs are increasing, replay filter works, subscriber unsubscribes', () => {
  const journal = new EventJournal();
  const received = [];
  const stop = journal.subscribe((evt) => received.push(evt));
  journal.publish({ runId: 'one', kind: 'step', message: 'a' });
  journal.publish({ runId: 'two', kind: 'step', message: 'b' });
  journal.publish({ runId: 'one', kind: 'result', message: 'c' });
  assert.deepEqual(
    journal.getSince(1, 'one').map((evt) => evt.message),
    ['c'],
  );
  assert.deepEqual(
    received.map((evt) => evt.id),
    [1, 2, 3],
  );
  stop();
  journal.publish({ runId: 'one', kind: 'step', message: 'd' });
  assert.equal(received.length, 3);
});
test('approval requires exact run/checkpoint identity and cannot be reused', async () => {
  const gate = new ApprovalGate();
  const controller = new AbortController();
  let id;
  const pending = gate.request(
    'run1',
    (newId) => {
      id = newId;
    },
    controller.signal,
    2000,
  );
  assert.equal(gate.answer('run2', id, true), false);
  assert.equal(gate.answer('run1', 'wrong', true), false);
  assert.equal(gate.answer('run1', id, true), true);
  assert.equal(await pending, true);
  assert.equal(gate.answer('run1', id, true), false);
});
test('approval rejects aborts without allowing a save', async () => {
  const gate = new ApprovalGate();
  const controller = new AbortController();
  const pending = gate.request('run1', () => {}, controller.signal, 2000);
  controller.abort();
  assert.equal(await pending, false);
});

test('human text prompt validates exact checkpoint and text length', async () => {
  const { PromptGate } = await import('../src/runs/prompts.ts');
  const gate = new PromptGate();
  const controller = new AbortController();
  let checkpoint;
  const waiting = gate.request(
    'run1',
    (id) => {
      checkpoint = id;
    },
    controller.signal,
    2000,
  );
  assert.equal(gate.answer('run2', checkpoint, 'choice'), false);
  assert.equal(gate.answer('run1', checkpoint, '  '), false);
  assert.equal(gate.answer('run1', checkpoint, 'observed option'), true);
  assert.equal(await waiting, 'observed option');
});

test('handle to platform URL allows @ but rejects URLs, email and path injection', () => {
  assert.equal(profileUrlForHandle('linkedin', '@surdma'), 'https://www.linkedin.com/in/surdma/');
  assert.equal(profileUrlForHandle('x', '@surdma'), 'https://x.com/surdma');
  for (const unsafe of ['https://x.com/user', 'a/b', 'a@b.com', '..', 'bad?x=y']) {
    assert.throws(() => profileUrlForHandle('x', unsafe));
  }
});
test('one-time credentials must be complete', () => {
  assert.throws(() =>
    validateRun({
      platform: 'x',
      action: 'audit',
      profileUrl: x,
      login: { identifier: 'somebody', password: '' },
    }),
  );
});

test('audit assessment distinguishes observation from a proposal', async () => {
  const { assessAudit } = await import('../src/core/assessment.ts');
  const events = new EventJournal();
  events.publish({
    runId: 'sample',
    kind: 'audit',
    message: 'Observed current profile',
    details: { headline: 'Current human-authored headline', url: 'https://www.linkedin.com/in/example' },
  });
  const summary = {
    id: 'sample',
    platform: 'linkedin',
    action: 'audit',
    state: 'completed',
    createdAt: new Date().toISOString(),
  };
  const report = assessAudit(events, summary, 'Evidence-backed draft');
  assert.equal(report.comparisons[0].status, 'review-candidate');
  assert.equal(report.comparisons[0].observed, 'Current human-authored headline');
  assert.equal(report.comparisons[0].proposed, 'Evidence-backed draft');
  assert.match(report.notice, /not an error/);
});
test('audit assessment does not invent missing observations', async () => {
  const { assessAudit } = await import('../src/core/assessment.ts');
  const events = new EventJournal();
  const report = assessAudit(
    events,
    {
      id: 'missing',
      platform: 'linkedin',
      action: 'audit',
      state: 'failed',
      createdAt: new Date().toISOString(),
    },
    'Draft',
  );
  assert.equal(report.comparisons[0].status, 'not-observed');
  assert.equal(report.comparisons[0].observed, null);
});

test('read-only audit retries a destroyed page context, but does not replay navigation', async () => {
  const { observeAfterNavigation } = await import('../src/workflows/execute.ts');
  let reads = 0,
    loads = 0,
    retries = 0;
  const page = {
    url: () => 'https://www.linkedin.com/in/surdma/',
    waitForLoadState: async () => {
      loads++;
    },
  };
  const result = await observeAfterNavigation(
    page,
    new URL('https://www.linkedin.com/in/surdma/'),
    async () => {
      if (++reads === 1)
        throw new Error(
          'page.evaluate: Execution context was destroyed, most likely because of a navigation',
        );
      return { headline: 'Verified read' };
    },
    {
      onRetry: () => {
        retries++;
      },
    },
  );
  assert.equal(result.headline, 'Verified read');
  assert.equal(reads, 2);
  assert.equal(retries, 1);
  assert.ok(loads >= 2);
});

test('audit read retry never bypasses a redirect to an unrelated page', async () => {
  const { observeAfterNavigation } = await import('../src/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/feed/', waitForLoadState: async () => {} };
  await assert.rejects(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => ({
      headline: 'wrong account',
    })),
    /different page/,
  );
});

test('audit never retries arbitrary script failures or cancelled work', async () => {
  const { observeAfterNavigation } = await import('../src/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/in/surdma/', waitForLoadState: async () => {} };
  let attempts = 0;
  await assert.rejects(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => {
      attempts++;
      throw new Error('Unexpected script bug');
    }),
    /Unexpected script bug/,
  );
  assert.equal(attempts, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    observeAfterNavigation(
      page,
      new URL('https://www.linkedin.com/in/surdma/'),
      async () => 'unreachable',
      { signal: controller.signal },
    ),
    /Run cancelled/,
  );
});

test('audit accepts LinkedIn www host redirect but never unrelated hosts', async () => {
  const { observeAfterNavigation } = await import('../src/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/in/surdma/', waitForLoadState: async () => {} };
  const good = await observeAfterNavigation(
    page,
    new URL('https://linkedin.com/in/surdma/'),
    async () => 42,
  );
  assert.equal(good, 42);
  page.url = () => 'https://www.linkedin.com.evil.test/in/surdma/';
  await assert.rejects(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => 99),
    /different page/,
  );
});

test('Scoped inspection accepts only exact owned LinkedIn/X pages', async () => {
  const { validatePageScope, validateRun } = await import('../src/core/validate.ts');
  const profile = new URL('https://www.linkedin.com/in/surdma/');
  const expected = 'https://www.linkedin.com/in/surdma/details/experience/';
  assert.equal(validatePageScope('linkedin', profile, expected).href, expected);
  assert.throws(
    () =>
      validatePageScope('linkedin', profile, 'https://www.linkedin.com/in/other/details/experience/'),
    /Unsupported/,
  );
  assert.throws(
    () => validatePageScope('linkedin', profile, 'https://www.linkedin.com/in/surdma/details/security/'),
    /Unsupported/,
  );
  assert.throws(
    () => validatePageScope('linkedin', profile, 'https://evil.test/in/surdma/'),
    /official/,
  );
  assert.throws(() => validatePageScope('linkedin', profile, `${expected}?token=1`), /official/);
  assert.equal(
    validateRun({
      platform: 'linkedin',
      action: 'audit-page',
      profileUrl: profile.href,
      pageUrl: expected,
    }).href,
    profile.href,
  );
  assert.throws(
    () => validateRun({ platform: 'linkedin', action: 'audit-page', profileUrl: profile.href }),
    /Choose/,
  );
  assert.throws(
    () =>
      validateRun({
        platform: 'linkedin',
        action: 'edit-profile',
        headline: 'Valid',
        profileUrl: profile.href,
        pageUrl: expected,
      }),
    /only for/,
  );
  assert.equal(
    validatePageScope('x', new URL('https://x.com/surdma'), 'https://x.com/surdma').pathname,
    '/surdma',
  );
  assert.throws(
    () => validatePageScope('x', new URL('https://x.com/surdma'), 'https://x.com/surdma/settings'),
    /Only the selected X/,
  );
});
