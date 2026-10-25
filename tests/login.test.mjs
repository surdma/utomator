import test from 'node:test';
import assert from 'node:assert/strict';
import { loginIfRequired } from '../src/auth/login.ts';

function pageAt(start, redirect = '/login') {
  let current = start;
  const calls = [];
  const locators = new Map();
  const locator = (selector) => {
    if (!locators.has(selector)) locators.set(selector, {
      count: async () => 1,
      isVisible: async () => true,
      fill: async value => calls.push(['fill', selector, value]),
      first() { return this; },
      click: async () => { calls.push(['click', selector]); current = 'https://www.linkedin.com/feed/'; },
    });
    return locators.get(selector);
  };
  return {
    calls,
    url: () => current,
    goto: async url => {
      calls.push(['goto', url]);
      current = url.includes('/in/') ? `https://www.linkedin.com${redirect}` : url;
    },
    locator,
    getByRole: (_type, spec) => ({ ...locator(`button:${spec.name}`), first() { return this; }, isVisible: async () => false }),
  };
}

test('no credentials never touches the browser', async () => {
  const p = pageAt('about:blank');
  await loginIfRequired(p, { platform: 'linkedin', action: 'audit', handle: 'surdma' }, new URL('https://www.linkedin.com/in/surdma/'), async () => {}, new AbortController().signal);
  assert.deepEqual(p.calls, []);
});

test('credentials only enter official LinkedIn form, then fail closed if login unresolved', async () => {
  const p = pageAt('about:blank');
  const credentials = { loginId: 'login@example.test', password: 'not-a-real-password' };
  await assert.rejects(() => loginIfRequired(p, { platform: 'linkedin', action: 'audit', credentials }, new URL('https://www.linkedin.com/in/surdma/'), async () => {}, new AbortController().signal), /Account not authenticated/);
  assert.deepEqual(p.calls.filter(x => x[0] === 'fill'), [ ['fill', '#username', credentials.loginId], ['fill', '#password', credentials.password] ]);
  assert.deepEqual(p.calls.filter(x => x[0] === 'goto' && !x[1].includes('/in/')), [['goto', 'https://www.linkedin.com/login']]);
});

test('redirects to untrusted host are refused before entering credentials', async () => {
  const p = pageAt('about:blank', 'https://evil.test/phish');
  p.goto = async url => { p.calls.push(['goto', url]); p.url = () => 'https://evil.test/phish'; };
  await assert.rejects(() => loginIfRequired(p, { platform: 'linkedin', action: 'audit', credentials: {loginId:'u',password:'secret'} }, new URL('https://www.linkedin.com/in/surdma/'), async () => {}, new AbortController().signal), /outside the official platform/);
  assert.equal(p.calls.filter(x => x[0] === 'fill').length, 0);
});

test('X login enters identifier and password only on X pages', async () => {
  let current = 'about:blank';
  const calls = [];
  const elem = selector => ({
    count: async () => 1,
    isVisible: async () => true,
    fill: async value => calls.push(['fill', selector, value]),
    first() { return this; },
    click: async () => { calls.push(['click', selector]); if (selector.includes('log in')) current = 'https://x.com/home'; },
  });
  const page = {
    calls,
    url: () => current,
    goto: async url => { calls.push(['goto', url]); current = url.includes('/surdma') ? 'https://x.com/i/flow/login' : url; },
    locator: elem,
    getByRole: (_role, { name }) => elem(name.source ?? String(name)),
  };
  await assert.rejects(() => loginIfRequired(page,
    { platform: 'x', action: 'audit', credentials: { loginId: 'handle', password: 'example-password' } },
    new URL('https://x.com/surdma'), async () => {}, new AbortController().signal), /Account not authenticated/);
  assert.ok(calls.some(c => c[0] === 'fill' && c[1].includes('username') && c[2] === 'handle'));
  assert.ok(calls.some(c => c[0] === 'fill' && c[1].includes('password') && c[2] === 'example-password'));
  assert.ok(calls.filter(c => c[0] === 'goto').every(c => c[1].startsWith('https://x.com/')));
});


test('redirect away from an official sign-in page blocks credential entry', async () => {
  let current = 'about:blank';
  const calls = [];
  const page = {
    url: () => current,
    goto: async url => { calls.push(['goto', url]); current = url.endsWith('/login') ? 'https://evil.test/phishing' : 'https://www.linkedin.com/login'; },
    locator: selector => ({ count: async () => 1, isVisible: async () => true, fill: async value => calls.push(['fill', selector, value]) }),
    getByRole: () => ({ first: () => ({ isVisible: async () => false }) }),
  };
  await assert.rejects(() => loginIfRequired(page,
    { platform: 'linkedin', action: 'audit', credentials: {loginId:'login',password:'secret'} },
    new URL('https://www.linkedin.com/in/surdma/'), async () => {}, new AbortController().signal), /outside the official platform/);
  assert.equal(calls.some(call => call[0] === 'fill'), false);
});
