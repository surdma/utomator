import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore, parseSocialAccount } from '../src/profile/account-store.js';

async function withStore(fn: (store: AccountStore, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'account-store-'));
  try { await fn(new AccountStore(root), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('fresh workspace does not inherit portfolio owner or social handles', async () => {
  await withStore(async (store, root) => {
    const first = await store.get();
    assert.equal(first.revision, 0);
    assert.deepEqual(first.socialAccounts, []);
    assert.deepEqual(first.profile, {displayName:'',email:'',location:'',about:''});
    const social = await store.addSocial(first.revision, {
      platform:'linkedin', label:'First owner', handle:'alice-smith',
      profileUrl:'https://www.linkedin.com/in/alice-smith/',
    });
    assert.equal(social.revision, 1);
    assert.equal(social.socialAccounts.length, 1);
    assert.deepEqual((await new AccountStore(root).get()).socialAccounts, social.socialAccounts,
      'social account survives restart before personal details are filled out');
    assert.equal((await new AccountStore(root).get()).profile.displayName, '');
  });
});

test('independent LinkedIn accounts persist and duplicate identities are rejected', async () => {
  await withStore(async (store, root) => {
    const first = await store.get();
    const changed = await store.updateProfile(first.revision, {
      displayName: 'Different Account Owner', email:'different@example.org', location:'Lagos', about:'Owner profile',
    });
    const alice = await store.addSocial(changed.revision, {
      platform:'linkedin',label:'Work LinkedIn',handle:'alice',
      profileUrl:'https://www.linkedin.com/in/alice/',
    });
    const bob = await store.addSocial(alice.revision, {
      platform:'linkedin',label:'Personal LinkedIn',handle:'bob',
      profileUrl:'https://www.linkedin.com/in/bob/',
    });
    assert.equal(bob.socialAccounts.filter(a=>a.platform==='linkedin').length, 2);
    await assert.rejects(store.addSocial(bob.revision, {
      platform:'linkedin',label:'Duplicate',handle:'BOB',profileUrl:'https://www.linkedin.com/in/bob/',
    }), /already exists/);
    const bobId = bob.socialAccounts.find(a=>a.handle==='bob')!.id;
    const renamed = await store.updateSocial(bob.revision, bobId, {
      platform:'linkedin',label:'Second profile',handle:'bob',profileUrl:'https://linkedin.com/in/bob/',
    });
    assert.equal(renamed.socialAccounts.find(a=>a.id===bobId)?.label, 'Second profile');
    const restored = await new AccountStore(root).get();
    assert.equal(restored.revision, 4);
    assert.equal(restored.socialAccounts.length, 2);
    const removed = await store.removeSocial(restored.revision, bobId);
    assert.equal(removed.socialAccounts.length, 1);
    assert.equal(removed.socialAccounts[0]?.handle, 'alice');
  });
});

test('account revisions and provider identity checks reject conflicting updates', async () => {
  await withStore(async store => {
    const initial = await store.get();
    assert.throws(() => parseSocialAccount({
      platform:'linkedin',label:'Wrong owner',handle:'alice',
      profileUrl:'https://linkedin.com/in/bob/',
    }), /handle must match/);
    assert.throws(() => parseSocialAccount({
      platform:'linkedin',label:'Wrong path',handle:'alice',
      profileUrl:'https://linkedin.com/company/alice/',
    }), /LinkedIn profile/);
    assert.throws(() => parseSocialAccount({
      platform:'linkedin',label:'Query',handle:'alice',
      profileUrl:'https://linkedin.com/in/alice?next=/in/bob',
    }), /without credentials or parameters/);
    assert.throws(() => parseSocialAccount({
      platform:'instagram',label:'Wrong host',handle:'alice',
      profileUrl:'https://example.org/alice',
    }), /does not match/);
    const full={displayName:'Test Owner',email:'test@example.org',location:'Lagos',about:'About'};
    const results=await Promise.allSettled([
      store.updateProfile(initial.revision,{...full,location:'Uyo'}),
      store.updateProfile(initial.revision,{...full,location:'Abuja'}),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    await assert.rejects(store.removeSocial(1,'00000000-0000-4000-8000-000000009999'),/not found/);
  });
});
