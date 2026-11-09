import { expect, test } from 'vitest';
import { EventJournal } from '../src/domain/events.ts';
import {
  profileUrlForHandle,
  validatePostUrl,
  validateProfileUrl,
  validateRun,
} from '../src/domain/validate.ts';
import { ApprovalGate } from '../src/infrastructure/runs/approvals.ts';

const linkedIn = 'https://www.linkedin.com/in/surdma/';
const x = 'https://x.com/surdma';

test('only legitimate direct profile URLs are accepted', () => {
  expect(validateProfileUrl('linkedin', linkedIn).pathname).toEqual('/in/surdma/');
  expect(validateProfileUrl('x', x).pathname).toEqual('/surdma');
  for (const bad of [
    'http://x.com/surdma',
    'https://x.com.evil.test/surdma',
    'https://x.com/surdma/settings',
    'https://evil.test',
  ]) {
    {
      let e;
      try {
        (() => validateProfileUrl('x', bad))();
      } catch (caught) {
        e = caught;
      }
      expect(e).toBeDefined();
      expect(() => {
        throw e;
      }).toThrow();
    }
  }
});
test('platform capabilities and required fields are enforced', () => {
  expect(() =>
    validateRun({ platform: 'linkedin', action: 'audit', profileUrl: linkedIn }),
  ).not.toThrow();
  {
    let e;
    try {
      (() => validateRun({ platform: 'linkedin', action: 'delete-post', profileUrl: linkedIn }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() => validateRun({ platform: 'x', action: 'edit-profile', profileUrl: x }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() =>
        validateRun({ platform: 'linkedin', action: 'add-skill', profileUrl: linkedIn, skill: ' ' }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() =>
        validateRun({
          platform: 'x',
          action: 'compose-post',
          profileUrl: x,
          postText: 'x'.repeat(281),
        }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
});
test('destructive post URLs cannot target a different account', () => {
  expect(validatePostUrl(new URL(x), 'https://x.com/surdma/status/123').pathname).toEqual(
    '/surdma/status/123',
  );
  {
    let e;
    try {
      (() => validatePostUrl(new URL(x), 'https://x.com/someone/status/123'))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() => validatePostUrl(new URL(x), 'https://x.com/surdma/status/123?delete=yes'))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() => validatePostUrl(new URL(x), 'https://x.com:8443/surdma/status/123'))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e;
    try {
      (() => validatePostUrl(new URL(x), 'https://other@x.com/surdma/status/123'))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
});
test('event IDs are increasing, replay filter works, subscriber unsubscribes', () => {
  const journal = new EventJournal();
  const received = [];
  const stop = journal.subscribe((evt) => received.push(evt));
  journal.publish({ runId: 'one', kind: 'step', message: 'a' });
  journal.publish({ runId: 'two', kind: 'step', message: 'b' });
  journal.publish({ runId: 'one', kind: 'result', message: 'c' });
  expect(journal.getSince(1, 'one').map((evt) => evt.message)).toEqual(['c']);
  expect(received.map((evt) => evt.id)).toEqual([1, 2, 3]);
  stop();
  journal.publish({ runId: 'one', kind: 'step', message: 'd' });
  expect(received.length).toEqual(3);
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
  expect(gate.answer('run2', id, true)).toEqual(false);
  expect(gate.answer('run1', 'wrong', true)).toEqual(false);
  expect(gate.answer('run1', id, true)).toEqual(true);
  expect(await pending).toEqual(true);
  expect(gate.answer('run1', id, true)).toEqual(false);
});
test('approval rejects aborts without allowing a save', async () => {
  const gate = new ApprovalGate();
  const controller = new AbortController();
  const pending = gate.request('run1', () => {}, controller.signal, 2000);
  controller.abort();
  expect(await pending).toEqual(false);
});

test('human text prompt validates exact checkpoint and text length', async () => {
  const { PromptGate } = await import('../src/infrastructure/runs/prompts.ts');
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
  expect(gate.answer('run2', checkpoint, 'choice')).toEqual(false);
  expect(gate.answer('run1', checkpoint, '  ')).toEqual(false);
  expect(gate.answer('run1', checkpoint, 'observed option')).toEqual(true);
  expect(await waiting).toEqual('observed option');
});

test('handle to platform URL allows @ but rejects URLs, email and path injection', () => {
  expect(profileUrlForHandle('linkedin', '@surdma')).toEqual('https://www.linkedin.com/in/surdma/');
  expect(profileUrlForHandle('x', '@surdma')).toEqual('https://x.com/surdma');
  for (const unsafe of ['https://x.com/user', 'a/b', 'a@b.com', '..', 'bad?x=y']) {
    {
      let e;
      try {
        (() => profileUrlForHandle('x', unsafe))();
      } catch (caught) {
        e = caught;
      }
      expect(e).toBeDefined();
      expect(() => {
        throw e;
      }).toThrow();
    }
  }
});
test('one-time credentials must be complete', () => {
  {
    let e;
    try {
      (() =>
        validateRun({
          platform: 'x',
          action: 'audit',
          profileUrl: x,
          login: { identifier: 'somebody', password: '' },
        }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
});

test('audit assessment distinguishes observation from a proposal', async () => {
  const { assessAudit } = await import('../src/infrastructure/runs/assessment.ts');
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
  expect(report.comparisons[0].status).toEqual('review-candidate');
  expect(report.comparisons[0].observed).toEqual('Current human-authored headline');
  expect(report.comparisons[0].proposed).toEqual('Evidence-backed draft');
  expect(report.notice).toMatch(/not an error/);
});
test('audit assessment does not invent missing observations', async () => {
  const { assessAudit } = await import('../src/infrastructure/runs/assessment.ts');
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
  expect(report.comparisons[0].status).toEqual('not-observed');
  expect(report.comparisons[0].observed).toEqual(null);
});

test('read-only audit retries a destroyed page context, but does not replay navigation', async () => {
  const { observeAfterNavigation } = await import('../src/infrastructure/workflows/execute.ts');
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
  expect(result.headline).toEqual('Verified read');
  expect(reads).toEqual(2);
  expect(retries).toEqual(1);
  expect(loads >= 2).toBeTruthy();
});

test('audit read retry never bypasses a redirect to an unrelated page', async () => {
  const { observeAfterNavigation } = await import('../src/infrastructure/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/feed/', waitForLoadState: async () => {} };
  await expect(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => ({
      headline: 'wrong account',
    })),
  ).rejects.toThrow(/different page/);
});

test('audit never retries arbitrary script failures or cancelled work', async () => {
  const { observeAfterNavigation } = await import('../src/infrastructure/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/in/surdma/', waitForLoadState: async () => {} };
  let attempts = 0;
  await expect(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => {
      attempts++;
      throw new Error('Unexpected script bug');
    }),
  ).rejects.toThrow(/Unexpected script bug/);
  expect(attempts).toEqual(1);
  const controller = new AbortController();
  controller.abort();
  await expect(
    observeAfterNavigation(
      page,
      new URL('https://www.linkedin.com/in/surdma/'),
      async () => 'unreachable',
      { signal: controller.signal },
    ),
  ).rejects.toThrow(/Run cancelled/);
});

test('audit accepts LinkedIn www host redirect but never unrelated hosts', async () => {
  const { observeAfterNavigation } = await import('../src/infrastructure/workflows/execute.ts');
  const page = { url: () => 'https://www.linkedin.com/in/surdma/', waitForLoadState: async () => {} };
  const good = await observeAfterNavigation(
    page,
    new URL('https://linkedin.com/in/surdma/'),
    async () => 42,
  );
  expect(good).toEqual(42);
  page.url = () => 'https://www.linkedin.com.evil.test/in/surdma/';
  await expect(
    observeAfterNavigation(page, new URL('https://www.linkedin.com/in/surdma/'), async () => 99),
  ).rejects.toThrow(/different page/);
});

test('Scoped inspection accepts only exact owned LinkedIn/X pages', async () => {
  const { validatePageScope, validateRun } = await import('../src/domain/validate.ts');
  const profile = new URL('https://www.linkedin.com/in/surdma/');
  const expected = 'https://www.linkedin.com/in/surdma/details/experience/';
  expect(validatePageScope('linkedin', profile, expected).href).toEqual(expected);
  expect(() =>
    validatePageScope('linkedin', profile, 'https://www.linkedin.com/in/other/details/experience/'),
  ).toThrow(/Unsupported/);
  expect(() =>
    validatePageScope('linkedin', profile, 'https://www.linkedin.com/in/surdma/details/security/'),
  ).toThrow(/Unsupported/);
  expect(() => validatePageScope('linkedin', profile, 'https://evil.test/in/surdma/')).toThrow(
    /official/,
  );
  expect(() => validatePageScope('linkedin', profile, `${expected}?token=1`)).toThrow(/official/);
  expect(
    validateRun({
      platform: 'linkedin',
      action: 'audit-page',
      profileUrl: profile.href,
      pageUrl: expected,
    }).href,
  ).toEqual(profile.href);
  expect(() =>
    validateRun({ platform: 'linkedin', action: 'audit-page', profileUrl: profile.href }),
  ).toThrow(/Choose/);
  expect(() =>
    validateRun({
      platform: 'linkedin',
      action: 'edit-profile',
      headline: 'Valid',
      profileUrl: profile.href,
      pageUrl: expected,
    }),
  ).toThrow(/only for/);
  expect(
    validatePageScope('x', new URL('https://x.com/surdma'), 'https://x.com/surdma').pathname,
  ).toEqual('/surdma');
  expect(() =>
    validatePageScope('x', new URL('https://x.com/surdma'), 'https://x.com/surdma/settings'),
  ).toThrow(/Only the selected X/);
});
