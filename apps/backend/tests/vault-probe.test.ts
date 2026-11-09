import type { Page } from 'playwright';
import { expect, test } from 'vitest';
import {
  classifyProviderAuth,
  seedOriginStorage,
  toVaultOriginState,
} from '../src/infrastructure/browser/vault-probe.js';

const authed = (url: string, platform: 'linkedin' | 'x') => classifyProviderAuth(url, platform);

test('LinkedIn classification trusts only authenticated feed/profile URLs', () => {
  expect(authed('https://www.linkedin.com/feed/', 'linkedin')).toEqual('authenticated');
  expect(authed('https://www.linkedin.com/', 'linkedin')).toEqual('authenticated');
  expect(authed('https://www.linkedin.com/in/owner-handle/', 'linkedin')).toEqual('authenticated');
  expect(authed('https://www.linkedin.com/feed/', 'x')).toEqual('auth-walled');
  // Bounces
  expect(authed('https://www.linkedin.com/authwall/protected?url=x', 'linkedin')).toEqual('auth-walled');
  expect(authed('https://authwall.linkedin.com/u/login', 'linkedin')).toEqual('auth-walled');
  expect(authed('https://www.linkedin.com/login?session_redirect=/feed/', 'linkedin')).toEqual(
    'auth-walled',
  );
  expect(authed('https://www.linkedin.com/checkpoint/lg/login', 'linkedin')).toEqual('auth-walled');
  expect(authed('https://www.linkedin.com/uas/login/', 'linkedin')).toEqual('auth-walled');
  // Unknown provider subdomain is never trusted
  expect(authed('https://unknown.linkedin.com/feed/', 'linkedin')).toEqual('auth-walled');
  expect(authed('not a url', 'linkedin')).toEqual('auth-walled');
  expect(authed('http://www.linkedin.com/feed/', 'linkedin')).toEqual('auth-walled');
});

test('X classification distinguishes home from login and consent flows', () => {
  expect(authed('https://x.com/home', 'x')).toEqual('authenticated');
  expect(authed('https://www.x.com/home', 'x')).toEqual('authenticated');
  expect(authed('https://x.com/i/flow/login', 'x')).toEqual('auth-walled');
  expect(authed('https://x.com/login', 'x')).toEqual('auth-walled');
});

test('storageState origins map into vault origin state', () => {
  const state = {
    cookies: [],
    origins: [
      {
        origin: 'https://www.linkedin.com',
        localStorage: [{ name: 'a', value: '1' }],
      },
    ],
  } as unknown as Parameters<typeof toVaultOriginState>[0];
  expect(toVaultOriginState(state)).toEqual([
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
    {
      origin: 'https://www.linkedin.com',
      localStorage: [{ name: 'theme', value: 'dark' }],
    },
    { origin: 'file://not-https', localStorage: [{ name: 'x', value: 'y' }] },
    { origin: 'not-a-url', localStorage: [{ name: 'x', value: 'y' }] },
  ]);
  // Only the HTTPS origin is visited. Closing the throwaway seed page is
  // openRestored's responsibility (it owns the context pages).
  expect(calls.length).toEqual(1);
  expect((calls[0].origin as string).startsWith('https://www.linkedin.com/')).toEqual(true);
  expect(calls[0].args).toEqual([['theme', 'dark']]);
});

test('seed origin navigation errors surface to the caller', async () => {
  const page = {
    goto: async () => {
      throw new Error('net::ERR_TIMED_OUT');
    },
    evaluate: async () => undefined,
    close: async () => undefined,
  } as unknown as Page;
  await expect(() =>
    seedOriginStorage(page, [
      {
        origin: 'https://www.linkedin.com',
        localStorage: [{ name: 'x', value: 'y' }],
      },
    ]),
  ).rejects.toThrow(/ERR_TIMED_OUT/);
});
