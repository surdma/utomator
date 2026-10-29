import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProviderAuth,
  toVaultOriginState,
  seedOriginStorage,
} from '../src/browser/vault-probe.js';
import type { Page } from 'playwright';

const authed = (url: string, platform: 'linkedin' | 'x') => classifyProviderAuth(url, platform);

test('LinkedIn classification trusts only authenticated feed/profile URLs', () => {
  assert.equal(authed('https://www.linkedin.com/feed/', 'linkedin'), 'authenticated');
  assert.equal(authed('https://www.linkedin.com/', 'linkedin'), 'authenticated');
  assert.equal(authed('https://www.linkedin.com/in/owner-handle/', 'linkedin'), 'authenticated');
  assert.equal(authed('https://www.linkedin.com/feed/', 'x'), 'auth-walled');
  // Bounces
  assert.equal(authed('https://www.linkedin.com/authwall/protected?url=x', 'linkedin'), 'auth-walled');
  assert.equal(authed('https://authwall.linkedin.com/u/login', 'linkedin'), 'auth-walled');
  assert.equal(
    authed('https://www.linkedin.com/login?session_redirect=/feed/', 'linkedin'),
    'auth-walled',
  );
  assert.equal(authed('https://www.linkedin.com/checkpoint/lg/login', 'linkedin'), 'auth-walled');
  assert.equal(authed('https://www.linkedin.com/uas/login/', 'linkedin'), 'auth-walled');
  // Unknown provider subdomain is never trusted
  assert.equal(authed('https://unknown.linkedin.com/feed/', 'linkedin'), 'auth-walled');
  assert.equal(authed('not a url', 'linkedin'), 'auth-walled');
  assert.equal(authed('http://www.linkedin.com/feed/', 'linkedin'), 'auth-walled');
});

test('X classification distinguishes home from login and consent flows', () => {
  assert.equal(authed('https://x.com/home', 'x'), 'authenticated');
  assert.equal(authed('https://www.x.com/home', 'x'), 'authenticated');
  assert.equal(authed('https://x.com/i/flow/login', 'x'), 'auth-walled');
  assert.equal(authed('https://x.com/login', 'x'), 'auth-walled');
});

test('storageState origins map into vault origin state', () => {
  const state = {
    cookies: [],
    origins: [{ origin: 'https://www.linkedin.com', localStorage: [{ name: 'a', value: '1' }] }],
  } as unknown as Parameters<typeof toVaultOriginState>[0];
  assert.deepEqual(toVaultOriginState(state), [
    {
      origin: 'https://www.linkedin.com',
      localStorage: [{ name: 'a', value: '1' }],
    },
  ]);
});

test('origin seeding navigates each HTTPS origin and writes its built-ins only', async () => {
  type Call = { origin: string; script: unknown; args: unknown };
  const calls: Call[] = [];
  const page = {
    goto: async (origin: string) => {
      calls.push({ origin, script: undefined, args: undefined });
    },
    evaluate: async (script: unknown, args: unknown) => {
      calls[calls.length - 1].script = script;
      calls[calls.length - 1].args = args;
    },
    close: async () => undefined,
  } as unknown as Page;
  await seedOriginStorage(page, [
    { origin: 'https://www.linkedin.com', localStorage: [{ name: 'theme', value: 'dark' }] },
    { origin: 'file://not-https', localStorage: [{ name: 'x', value: 'y' }] },
    { origin: 'not-a-url', localStorage: [{ name: 'x', value: 'y' }] },
  ]);
  // Only the HTTPS origin is visited. Closing the throwaway seed page is
  // openRestored's responsibility (it owns the context pages).
  assert.equal(calls.length, 1);
  assert.equal((calls[0].origin as string).startsWith('https://www.linkedin.com/'), true);
  assert.deepEqual(calls[0].args, [['theme', 'dark']]);
});

test('seed origin navigation errors surface to the caller', async () => {
  const page = {
    goto: async () => {
      throw new Error('net::ERR_TIMED_OUT');
    },
    evaluate: async () => undefined,
    close: async () => undefined,
  } as unknown as Page;
  await assert.rejects(
    () =>
      seedOriginStorage(page, [
        {
          origin: 'https://www.linkedin.com',
          localStorage: [{ name: 'x', value: 'y' }],
        },
      ]),
    /ERR_TIMED_OUT/,
  );
});
