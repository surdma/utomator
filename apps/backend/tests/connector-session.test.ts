import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { AccountStore } from '../src/profile/account-store.js';
import { ConnectorService } from '../src/core/connectors.js';

async function registerAccounts(store: AccountStore) {
  const first = await store.addSocial(0, {
    platform:'linkedin', label:'Connector Owner',handle:'connector-owner',
    profileUrl:'https://www.linkedin.com/in/connector-owner/',
  });
  const second = await store.addSocial(first.revision, {
    platform:'x', label:'X owner',handle:'connector_owner',
    profileUrl:'https://x.com/connector_owner',
  });
  return store.addSocial(second.revision, {
    platform:'instagram', label:'API only',handle:'connector.owner',
    profileUrl:'https://www.instagram.com/connector.owner/',
  });
}

test('connector verifies browser ownership, isolates accounts and requires reconnection', async () => {
  const root = await mkdtemp(join(tmpdir(),'utomator-connectors-'));
  try {
    const accountStore = new AccountStore(root);
    await registerAccounts(accountStore);
    let ownPage = true;
    const browser = {
      currentPage: undefined as Page | undefined,
      async open() {
        const page = {
          url: () => 'https://www.linkedin.com/in/connector-owner/',
          goto: async () => null,
          getByRole: () => ({first:()=>({waitFor:async()=>{if(!ownPage)throw Error('Not visible');}})}),
        } as unknown as Page;
        this.currentPage = page;
        return page;
      },
      async close() { this.currentPage = undefined; },
    };
    const connectors = new ConnectorService(accountStore,()=>browser,root);
    const owner = (await accountStore.get()).socialAccounts.find(a=>a.platform==='linkedin')!;
    const x = (await accountStore.get()).socialAccounts.find(a=>a.platform==='x')!;
    const apiOnly = (await accountStore.get()).socialAccounts.find(a=>a.platform==='instagram')!;
    assert.equal((await connectors.list()).find(a=>a.id===owner.id)?.status,'disconnected');
    // Instagram/GitHub/Dev.to remain queued for official API connectors.
    assert.equal((await connectors.list()).find(a=>a.id===apiOnly.id)?.status,'api-required');
    await assert.rejects(connectors.begin(apiOnly.id), /official API connector/);
    await assert.rejects(connectors.requireConnected(owner.id,'linkedin',owner.profileUrl), /not verified/);
    await connectors.begin(owner.id);
    assert.equal((await connectors.list()).find(a=>a.id===owner.id)?.status,'sign-in-open');
    const checked = await connectors.sync(owner.id);
    assert.equal(checked.status,'connected');
    await connectors.requireConnected(owner.id,'linkedin',owner.profileUrl);
    await connectors.requireConnected(owner.id,'linkedin');
    await assert.rejects(
      connectors.requireConnected(owner.id,'linkedin','https://www.linkedin.com/in/not-owner/'),
      /does not match/);
    await assert.rejects(connectors.requireConnected(owner.id,'x',owner.profileUrl), /does not match/);
    assert.equal((await new ConnectorService(accountStore,()=>browser,root).list()).find(a=>a.id===owner.id)?.status,'connected');
    ownPage=false;
    assert.equal((await connectors.sync(owner.id)).status,'reconnect-required');
    // An incomplete login must leave the same browser open for MFA/retry.
    assert(browser.currentPage, 'the sign-in page must remain available after an unsuccessful sync');
    assert.equal((await connectors.list()).find(a=>a.id===owner.id)?.status,'sign-in-open');
    await assert.rejects(connectors.requireConnected(owner.id,'linkedin',owner.profileUrl), /not verified/);
    // Closing the sign-in tab must allow another Connect action to reopen it.
    let reopened=0;
    const oldOpen=browser.open.bind(browser);
    browser.open=async()=>{reopened++;return oldOpen();};
    (browser.currentPage as Page & {isClosed?:()=>boolean}).isClosed=()=>true;
    assert.equal((await connectors.list()).find(a=>a.id===owner.id)?.status,'disconnected');
    await connectors.begin(owner.id);
    assert.equal(reopened,1,'Connect reopens Chrome instead of returning stale sign-in-open');
    ownPage=true;
    assert.equal((await connectors.sync(owner.id)).status,'connected');
    await connectors.disconnect(owner.id);
    assert.equal(browser.currentPage, undefined, 'disconnect closes the isolated login browser');
    assert.equal((await connectors.list()).find(a=>a.id===owner.id)?.status,'disconnected');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('LinkedIn timeouts retain the sign-in window and prior verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-connector-timeout-'));
  try {
    const accounts = new AccountStore(root);
    await registerAccounts(accounts);
    let reachable = false;
    let ownerControl = false;
    const browser = {
      currentPage: undefined as Page | undefined,
      async open() {
        this.currentPage = {
          url: () => 'https://www.linkedin.com/in/connector-owner/',
          goto: async () => {
            if (!reachable) throw Error('page.goto: net::ERR_CONNECTION_TIMED_OUT');
          },
          getByRole: () => ({first: () => ({
            waitFor: async () => { if (!ownerControl) throw Error('Not visible'); },
          })}),
        } as unknown as Page;
        return this.currentPage;
      },
      async close() { this.currentPage = undefined; },
    };
    const service = new ConnectorService(accounts, () => browser, root);
    const account = (await accounts.get()).socialAccounts.find(a => a.platform === 'linkedin')!;
    const opened = await service.begin(account.id);
    assert.equal(opened.status, 'sign-in-open');
    assert.match(opened.navigationWarning ?? '', /did not respond/);
    assert(browser.currentPage, 'Chrome should remain open for the account owner');
    assert.equal((await service.sync(account.id)).status, 'temporarily-unavailable');
    assert(browser.currentPage);
    reachable = true;
    ownerControl = true;
    assert.equal((await service.sync(account.id)).status, 'connected');
    assert.equal((await service.list()).find(row => row.id === account.id)?.status, 'connected');
    await service.begin(account.id);
    reachable = false;
    assert.equal((await service.sync(account.id)).status, 'temporarily-unavailable');
    const restored = new ConnectorService(accounts, () => browser, root);
    assert.equal((await restored.list()).find(row => row.id === account.id)?.status, 'connected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('X connector verifies ownership through the owner-only Edit profile control', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-x-connector-'));
  try {
    const store = new AccountStore(root);
    await registerAccounts(store);
    const xAccount = (await store.get()).socialAccounts.find(a => a.platform === 'x')!;
    let signedIn = false;
    let currentUrl = 'https://x.com/connector_owner';
    const browser = {
      currentPage: undefined as Page | undefined,
      async open(platform: string) {
        assert.equal(platform, 'x', 'the X connector must open X in the isolated browser');
        this.currentPage = {
          url: () => currentUrl,
          goto: async (url: string) => { currentUrl = url; },
          getByRole: (role: string, options: { name: RegExp }) => ({
            first: () => ({
              waitFor: async () => {
                // The owner sees "Edit profile" (a link to /settings/profile).
                const expected = role === 'link' && options.name.test('Edit profile');
                if (!signedIn || !expected) throw Error('Not visible');
              },
            }),
          }),
        } as unknown as Page;
        return this.currentPage;
      },
      async close() { this.currentPage = undefined; },
    };
    const service = new ConnectorService(store, () => browser, root);
    assert.equal((await service.list()).find(row => row.id === xAccount.id)?.status, 'disconnected');
    const opened = await service.begin(xAccount.id);
    assert.equal(opened.status, 'sign-in-open');
    assert.equal((await service.list()).find(row => row.id === xAccount.id)?.status, 'sign-in-open');
    // Signed out: no owner-only control, so verification must not fake success.
    assert.equal((await service.sync(xAccount.id)).status, 'reconnect-required');
    signedIn = true;
    assert.equal((await service.sync(xAccount.id)).status, 'connected');
    assert.equal((await service.list()).find(row => row.id === xAccount.id)?.status, 'connected');
    await service.requireConnected(xAccount.id, 'x');
    await service.requireConnected(xAccount.id, 'x', xAccount.profileUrl);
    await assert.rejects(
      service.requireConnected(xAccount.id, 'x', 'https://x.com/not-the-owner/'),
      /does not match/,
    );
    // A new service instance reads the persisted record: state survives restarts.
    const restored = new ConnectorService(store, () => browser, root);
    assert.equal((await restored.list()).find(row => row.id === xAccount.id)?.status, 'connected');
    await service.disconnect(xAccount.id);
    assert.equal(browser.currentPage, undefined, 'disconnect closes the isolated login browser');
    assert.equal((await service.list()).find(row => row.id === xAccount.id)?.status, 'disconnected');
    await assert.rejects(service.requireConnected(xAccount.id, 'x'), /not verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('two LinkedIn accounts resolve independently to their saved profile URLs', async () => {
  const root=await mkdtemp(join(tmpdir(),'utomator-two-accounts-'));
  try {
    const store=new AccountStore(root);
    const alice=await store.addSocial(0,{platform:'linkedin',label:'Alice',
      handle:'alice',profileUrl:'https://www.linkedin.com/in/alice/'});
    const bob=await store.addSocial(alice.revision,{platform:'linkedin',label:'Bob',
      handle:'bob',profileUrl:'https://www.linkedin.com/in/bob/'});
    const first=bob.socialAccounts.find(row=>row.handle==='alice')!;
    const second=bob.socialAccounts.find(row=>row.handle==='bob')!;
    const service=new ConnectorService(store,()=>({
      currentPage:undefined as Page|undefined,
      async open(){
        let currentUrl='about:blank';
        this.currentPage={
          url:()=>currentUrl,
          goto:async(url:string)=>{currentUrl=url;return null;},
          getByRole:()=>({first:()=>({waitFor:async()=>undefined})}),
        } as unknown as Page;
        return this.currentPage;
      },
      async close(){this.currentPage=undefined;},
    }),root);
    for(const row of [first,second]){
      await service.begin(row.id);
      assert.equal((await service.sync(row.id)).status,'connected');
    }
    assert.equal((await service.list()).filter(row=>row.status==='connected').length,2);
    assert.equal((await service.requireConnected(first.id,'linkedin')).profileUrl,first.profileUrl);
    assert.equal((await service.requireConnected(second.id,'linkedin')).profileUrl,second.profileUrl);
    await assert.rejects(service.requireConnected(first.id,'linkedin',second.profileUrl),/does not match/);
    await service.disconnect(first.id);
    assert.equal((await service.list()).find(row=>row.id===second.id)?.status,'connected');
  } finally {await rm(root,{recursive:true,force:true});}
});
