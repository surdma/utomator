import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  AccountStore,
  blankProfile,
  mergeEmptyProfile,
  parseSocialAccount,
} from '../src/profile/account-store.js';

async function withStore(fn: (store: AccountStore, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'account-store-'));
  try {
    await fn(new AccountStore(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('fresh workspace does not inherit portfolio owner or social handles', async () => {
  await withStore(async (store, root) => {
    const first = await store.get();
    assert.equal(first.revision, 0);
    assert.deepEqual(first.socialAccounts, []);
    assert.deepEqual(first.profile, blankProfile());
    const social = await store.addSocial(first.revision, {
      platform: 'linkedin',
      label: 'First owner',
      handle: 'alice-smith',
      profileUrl: 'https://www.linkedin.com/in/alice-smith/',
    });
    assert.equal(social.revision, 1);
    assert.equal(social.socialAccounts.length, 1);
    assert.deepEqual(
      (await new AccountStore(root).get()).socialAccounts,
      social.socialAccounts,
      'social account survives restart before personal details are filled out',
    );
    assert.equal((await new AccountStore(root).get()).profile.displayName, '');
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
    assert.equal(alice.revision, changed.revision + 1);
    await assert.rejects(
      store.linkVerifiedSocial('00000000-0000-4000-8000-000000000012', {
        platform: 'linkedin',
        label: 'Personal LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
      /Only one linked account/,
    );
    await assert.rejects(
      store.addSocial(alice.revision, {
        platform: 'linkedin',
        label: 'Other LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
      /Only one linked account/,
    );
    const x = await store.linkVerifiedSocial('00000000-0000-4000-8000-000000000013', {
      platform: 'x',
      label: 'X profile',
      handle: 'alice',
      profileUrl: 'https://x.com/alice',
    });
    assert.equal(x.socialAccounts.length, 2);
    assert.equal((await new AccountStore(root).get()).socialAccounts.length, 2);
    await assert.rejects(
      store.updateSocial(x.revision, x.socialAccounts[1]!.id, {
        platform: 'linkedin',
        label: 'Other LinkedIn',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
      /Only one linked account/,
    );
    const removed = await store.removeSocial(x.revision, alice.socialAccounts[0]!.id);
    assert.equal(removed.socialAccounts.length, 1);
  });
});

test('account revisions and provider identity checks reject conflicting updates', async () => {
  await withStore(async (store) => {
    const initial = await store.get();
    assert.throws(
      () =>
        parseSocialAccount({
          platform: 'linkedin',
          label: 'Wrong owner',
          handle: 'alice',
          profileUrl: 'https://linkedin.com/in/bob/',
        }),
      /handle must match/,
    );
    assert.throws(
      () =>
        parseSocialAccount({
          platform: 'linkedin',
          label: 'Wrong path',
          handle: 'alice',
          profileUrl: 'https://linkedin.com/company/alice/',
        }),
      /LinkedIn profile/,
    );
    assert.throws(
      () =>
        parseSocialAccount({
          platform: 'linkedin',
          label: 'Query',
          handle: 'alice',
          profileUrl: 'https://linkedin.com/in/alice?next=/in/bob',
        }),
      /without credentials or parameters/,
    );
    assert.throws(
      () =>
        parseSocialAccount({
          platform: 'instagram',
          label: 'Wrong host',
          handle: 'alice',
          profileUrl: 'https://example.org/alice',
        }),
      /does not match/,
    );
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
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    await assert.rejects(store.removeSocial(1, '00000000-0000-4000-8000-000000009999'), /not found/);
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
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/account/social',
          payload: fake,
        })
      ).statusCode,
      405,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: '/account/social/00000000-0000-4000-8000-000000000000',
          payload: fake,
        })
      ).statusCode,
      405,
    );
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
  assert.equal(merged.displayName, 'Ada Lovelace');
  assert.equal(merged.about, 'Already written');
  assert.equal(merged.headline, 'Engineer');
  assert.equal(merged.location, 'Lagos');
  assert.equal(merged.website, 'https://example.com/ada');
  assert.equal(merged.avatarUrl, '');
});
