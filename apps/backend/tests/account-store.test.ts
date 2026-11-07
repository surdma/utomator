import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  AccountStore,
  blankProfile,
  mergeEmptyProfile,
  parseSocialAccount,
} from '../src/infrastructure/profile/account-store.js';
import { removeTemp } from './support/remove-temp.js';

async function withStore(fn: (store: AccountStore, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'account-store-'));
  try {
    await fn(new AccountStore(root), root);
  } finally {
    await removeTemp(root);
  }
}

test('fresh workspace does not inherit portfolio owner or social handles', async () => {
  await withStore(async (store, root) => {
    const first = await store.get();
    expect(first.revision).toEqual(0);
    expect(first.socialAccounts).toEqual([]);
    expect(first.profile).toEqual(blankProfile());
    const social = await store.addSocial(first.revision, {
      platform: 'linkedin',
      label: 'First owner',
      handle: 'alice-smith',
      profileUrl: 'https://www.linkedin.com/in/alice-smith/',
    });
    expect(social.revision).toEqual(1);
    expect(social.socialAccounts.length).toEqual(1);
    expect((await new AccountStore(root).get()).socialAccounts).toEqual(social.socialAccounts);
    expect((await new AccountStore(root).get()).profile.displayName).toEqual('');
  });
});

test('one verified account per provider and linked identities persist', async () => {
  await withStore(async (store, root) => {
    const first = await store.get();
    const changed = await store.updateProfile(first.revision, {
      displayName: 'Different Account Owner',
      email: 'different@example.org',
      location: 'Lagos',
      about: 'Owner profile',
    });
    const alice = await store.linkVerifiedSocial('00000000-0000-4000-8000-000000000011', {
      platform: 'linkedin',
      label: 'Work LinkedIn',
      handle: 'alice',
      profileUrl: 'https://www.linkedin.com/in/alice/',
    });
    expect(alice.revision).toEqual(changed.revision + 1);
    await expect(
      store.linkVerifiedSocial('00000000-0000-4000-8000-000000000012', {
        platform: 'linkedin',
        label: 'Personal LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
    ).rejects.toThrow(/Only one linked account/);
    await expect(
      store.addSocial(alice.revision, {
        platform: 'linkedin',
        label: 'Other LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
    ).rejects.toThrow(/Only one linked account/);
    const x = await store.linkVerifiedSocial('00000000-0000-4000-8000-000000000013', {
      platform: 'x',
      label: 'X profile',
      handle: 'alice',
      profileUrl: 'https://x.com/alice',
    });
    expect(x.socialAccounts.length).toEqual(2);
    expect((await new AccountStore(root).get()).socialAccounts.length).toEqual(2);
    await expect(
      store.updateSocial(x.revision, x.socialAccounts[1]!.id, {
        platform: 'linkedin',
        label: 'Other LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
    ).rejects.toThrow(/Only one linked account/);
    const removed = await store.removeSocial(x.revision, alice.socialAccounts[0]!.id);
    expect(removed.socialAccounts.length).toEqual(1);
  });
});

test('account revisions and provider identity checks reject conflicting updates', async () => {
  await withStore(async (store) => {
    const initial = await store.get();
    expect(() =>
      parseSocialAccount({
        platform: 'linkedin',
        label: 'Wrong owner',
        handle: 'alice',
        profileUrl: 'https://linkedin.com/in/bob/',
      }),
    ).toThrow(/handle must match/);
    expect(() =>
      parseSocialAccount({
        platform: 'linkedin',
        label: 'Wrong path',
        handle: 'alice',
        profileUrl: 'https://linkedin.com/company/alice/',
      }),
    ).toThrow(/LinkedIn profile/);
    expect(() =>
      parseSocialAccount({
        platform: 'linkedin',
        label: 'Query',
        handle: 'alice',
        profileUrl: 'https://linkedin.com/in/alice?next=/in/bob',
      }),
    ).toThrow(/without credentials or parameters/);
    expect(() =>
      parseSocialAccount({
        platform: 'instagram',
        label: 'Wrong host',
        handle: 'alice',
        profileUrl: 'https://example.org/alice',
      }),
    ).toThrow(/does not match/);
    const full = {
      displayName: 'Test Owner',
      email: 'test@example.org',
      location: 'Lagos',
      about: 'About',
    };
    const results = await Promise.allSettled([
      store.updateProfile(initial.revision, { ...full, location: 'Uyo' }),
      store.updateProfile(initial.revision, { ...full, location: 'Abuja' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toEqual(1);
    expect(results.filter((r) => r.status === 'rejected').length).toEqual(1);
    await expect(store.removeSocial(1, '00000000-0000-4000-8000-000000009999')).rejects.toThrow(
      /not found/,
    );
  });
});

test('manual account API write is not a valid linking mechanism', async () => {
  process.env.NODE_ENV = 'test';
  const { buildApp } = await import('../src/main.js');
  const app = buildApp();
  try {
    await app.ready();
    const fake = {
      expectedRevision: 0,
      document: {
        platform: 'linkedin',
        label: 'Attacker',
        handle: 'attacker',
        profileUrl: 'https://www.linkedin.com/in/attacker/',
      },
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/account/social',
          payload: fake,
        })
      ).statusCode,
    ).toEqual(405);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/account/social/00000000-0000-4000-8000-000000000000',
          payload: fake,
        })
      ).statusCode,
    ).toEqual(405);
  } finally {
    await app.close();
  }
});

test('sync fills empty profile fields and leaves a completed field unchanged', async () => {
  const current = {
    ...blankProfile(),
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    about: 'Already written',
  };
  const merged = mergeEmptyProfile(current, {
    displayName: 'Someone Else',
    headline: 'Engineer',
    location: 'Lagos',
    about: 'From LinkedIn',
    avatarUrl: 'https://media.licdn.com/dms/image/profile-displaybackgroundimage-shrink_200_800/banner',
    website: 'https://example.com/ada',
  });
  expect(merged.displayName).toEqual('Ada Lovelace');
  expect(merged.about).toEqual('Already written');
  expect(merged.headline).toEqual('Engineer');
  expect(merged.location).toEqual('Lagos');
  expect(merged.website).toEqual('https://example.com/ada');
  expect(merged.avatarUrl).toEqual('');
});
