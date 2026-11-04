import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { BrowserSession } from '../src/browser/session.js';
import { ConnectorService } from '../src/connect/service.js';
import { AccountStore } from '../src/profile/account-store.js';

async function registerAccounts(store: AccountStore) {
  const first = await store.addSocial(0, {
    platform: 'linkedin',
    label: 'Connector Owner',
    handle: 'connector-owner',
    profileUrl: 'https://www.linkedin.com/in/connector-owner/',
  });
  const second = await store.addSocial(first.revision, {
    platform: 'x',
    label: 'X owner',
    handle: 'connector_owner',
    profileUrl: 'https://x.com/connector_owner',
  });
  return store.addSocial(second.revision, {
    platform: 'instagram',
    label: 'API only',
    handle: 'connector.owner',
    profileUrl: 'https://www.instagram.com/connector.owner/',
  });
}

test('connector verifies browser ownership, isolates accounts and requires reconnection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-connectors-'));
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
          getByRole: () => ({
            first: () => ({
              waitFor: async () => {
                if (!ownPage) throw Error('Not visible');
              },
            }),
          }),
        } as unknown as Page;
        this.currentPage = page;
        return page;
      },
      async close() {
        this.currentPage = undefined;
      },
    };
    const connectors = new ConnectorService(accountStore, () => browser, root);
    const owner = (await accountStore.get()).socialAccounts.find((a) => a.platform === 'linkedin')!;
    const x = (await accountStore.get()).socialAccounts.find((a) => a.platform === 'x')!;
    const apiOnly = (await accountStore.get()).socialAccounts.find((a) => a.platform === 'instagram')!;
    assert.equal((await connectors.list()).find((a) => a.id === owner.id)?.status, 'disconnected');
    // Instagram/GitHub/Dev.to remain queued for official API connectors.
    assert.equal((await connectors.list()).find((a) => a.id === apiOnly.id)?.status, 'api-required');
    await assert.rejects(connectors.begin(apiOnly.id), /official API connector/);
    await assert.rejects(
      connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl),
      /not verified/,
    );
    await connectors.begin(owner.id);
    assert.equal((await connectors.list()).find((a) => a.id === owner.id)?.status, 'sign-in-open');
    const checked = await connectors.sync(owner.id);
    assert.equal(checked.status, 'connected');
    await connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl);
    await connectors.requireConnected(owner.id, 'linkedin');
    await assert.rejects(
      connectors.requireConnected(owner.id, 'linkedin', 'https://www.linkedin.com/in/not-owner/'),
      /does not match/,
    );
    await assert.rejects(connectors.requireConnected(owner.id, 'x', owner.profileUrl), /does not match/);
    assert.equal(
      (await new ConnectorService(accountStore, () => browser, root).list()).find(
        (a) => a.id === owner.id,
      )?.status,
      'connected',
    );
    ownPage = false;
    assert.equal((await connectors.sync(owner.id)).status, 'reconnect-required');
    // An incomplete login must leave the same browser open for MFA/retry.
    assert(browser.currentPage, 'the sign-in page must remain available after an unsuccessful sync');
    assert.equal((await connectors.list()).find((a) => a.id === owner.id)?.status, 'sign-in-open');
    await assert.rejects(
      connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl),
      /not verified/,
    );
    // Closing the sign-in tab must allow another Connect action to reopen it.
    let reopened = 0;
    const oldOpen = browser.open.bind(browser);
    browser.open = async () => {
      reopened++;
      return oldOpen();
    };
    (browser.currentPage as Page & { isClosed?: () => boolean }).isClosed = () => true;
    assert.equal((await connectors.list()).find((a) => a.id === owner.id)?.status, 'disconnected');
    await connectors.begin(owner.id);
    assert.equal(reopened, 1, 'Connect reopens Chrome instead of returning stale sign-in-open');
    ownPage = true;
    assert.equal((await connectors.sync(owner.id)).status, 'connected');
    await connectors.disconnect(owner.id);
    assert.equal(browser.currentPage, undefined, 'disconnect closes the isolated login browser');
    assert.equal((await connectors.list()).find((a) => a.id === owner.id)?.status, 'disconnected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
          getByRole: () => ({
            first: () => ({
              waitFor: async () => {
                if (!ownerControl) throw Error('Not visible');
              },
            }),
          }),
        } as unknown as Page;
        return this.currentPage;
      },
      async close() {
        this.currentPage = undefined;
      },
    };
    const service = new ConnectorService(accounts, () => browser, root);
    const account = (await accounts.get()).socialAccounts.find((a) => a.platform === 'linkedin')!;
    const opened = await service.begin(account.id);
    assert.equal(opened.status, 'sign-in-open');
    assert.match(opened.navigationWarning ?? '', /did not respond/);
    assert(browser.currentPage, 'Chrome should remain open for the account owner');
    assert.equal((await service.sync(account.id)).status, 'temporarily-unavailable');
    assert(browser.currentPage);
    reachable = true;
    ownerControl = true;
    assert.equal((await service.sync(account.id)).status, 'connected');
    assert.equal((await service.list()).find((row) => row.id === account.id)?.status, 'connected');
    await service.begin(account.id);
    reachable = false;
    assert.equal((await service.sync(account.id)).status, 'temporarily-unavailable');
    const restored = new ConnectorService(accounts, () => browser, root);
    assert.equal((await restored.list()).find((row) => row.id === account.id)?.status, 'connected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('X connector verifies ownership through the owner-only Edit profile control', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-x-connector-'));
  try {
    const store = new AccountStore(root);
    await registerAccounts(store);
    const xAccount = (await store.get()).socialAccounts.find((a) => a.platform === 'x')!;
    let signedIn = false;
    let currentUrl = 'https://x.com/connector_owner';
    const browser = {
      currentPage: undefined as Page | undefined,
      async open(platform: string) {
        assert.equal(platform, 'x', 'the X connector must open X in the isolated browser');
        this.currentPage = {
          url: () => currentUrl,
          goto: async (url: string) => {
            currentUrl = url;
          },
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
      async close() {
        this.currentPage = undefined;
      },
    };
    const service = new ConnectorService(store, () => browser, root);
    assert.equal((await service.list()).find((row) => row.id === xAccount.id)?.status, 'disconnected');
    const opened = await service.begin(xAccount.id);
    assert.equal(opened.status, 'sign-in-open');
    assert.equal((await service.list()).find((row) => row.id === xAccount.id)?.status, 'sign-in-open');
    // Signed out: no owner-only control, so verification must not fake success.
    assert.equal((await service.sync(xAccount.id)).status, 'reconnect-required');
    signedIn = true;
    assert.equal((await service.sync(xAccount.id)).status, 'connected');
    assert.equal((await service.list()).find((row) => row.id === xAccount.id)?.status, 'connected');
    await service.requireConnected(xAccount.id, 'x');
    await service.requireConnected(xAccount.id, 'x', xAccount.profileUrl);
    await assert.rejects(
      service.requireConnected(xAccount.id, 'x', 'https://x.com/not-the-owner/'),
      /does not match/,
    );
    // A new service instance reads the persisted record: state survives restarts.
    const restored = new ConnectorService(store, () => browser, root);
    assert.equal((await restored.list()).find((row) => row.id === xAccount.id)?.status, 'connected');
    await service.disconnect(xAccount.id);
    assert.equal(browser.currentPage, undefined, 'disconnect closes the isolated login browser');
    assert.equal((await service.list()).find((row) => row.id === xAccount.id)?.status, 'disconnected');
    await assert.rejects(service.requireConnected(xAccount.id, 'x'), /not verified/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser-sign-in discovers a new LinkedIn identity without a typed profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-discovery-'));
  try {
    const store = new AccountStore(root);
    let url = 'https://www.linkedin.com/feed/';
    let signedIn = false;
    const page = {
      url: () => url,
      isClosed: () => false,
      goto: async (next: string) => {
        url = next;
      },
      locator: (selector: string) => ({
        first: () => ({
          getAttribute: async () =>
            signedIn && selector.includes('identity_profile_photo') ? '/in/verified-owner/' : null,
        }),
      }),
      getByRole: () => ({
        first: () => ({
          waitFor: async () => {
            if (!signedIn) throw Error('Sign in required');
          },
        }),
      }),
    } as unknown as Page;
    const browser = {
      currentPage: undefined as Page | undefined,
      async open() {
        this.currentPage = page;
        return page;
      },
      async close() {
        this.currentPage = undefined;
      },
    };
    const service = new ConnectorService(store, () => browser, root);
    const started = await service.start('linkedin');
    assert.equal(service.capabilities().mobileBrowserSession, false);
    assert.equal(started.status, 'sign-in-open');
    assert.equal((await store.get()).socialAccounts.length, 0);
    assert.equal((await service.check(started.accountId)).status, 'sign-in-open');
    signedIn = true;
    assert.equal((await service.check(started.accountId)).status, 'connected');
    const saved = (await store.get()).socialAccounts;
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.handle, 'verified-owner');
    assert.equal(saved[0]?.id, started.accountId);
    assert.equal(
      (await service.list()).find((row) => row.id === started.accountId)?.status,
      'connected',
    );
    await assert.rejects(service.start('linkedin'), /already exists/);
    await service.disconnect(started.accountId);
    await assert.rejects(service.sync(started.accountId), /Connect before requesting sync/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('one account per platform prevents a second LinkedIn profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-unique-'));
  try {
    const store = new AccountStore(root);
    const a = await store.addSocial(0, {
      platform: 'linkedin',
      label: 'Alice',
      handle: 'alice',
      profileUrl: 'https://www.linkedin.com/in/alice/',
    });
    await assert.rejects(
      store.addSocial(a.revision, {
        platform: 'linkedin',
        label: 'Bob',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }),
      /Only one linked account/,
    );
    const service = new ConnectorService(store, undefined, root);
    await assert.rejects(service.start('linkedin'), /already exists/);
    await assert.rejects(service.start('github'), /Official API connector not configured/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('disconnected saved account cannot sync until Connect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-sync-guard-'));
  try {
    const store = new AccountStore(root);
    const state = await store.addSocial(0, {
      platform: 'linkedin',
      label: 'LinkedIn',
      handle: 'owner',
      profileUrl: 'https://www.linkedin.com/in/owner/',
    });
    const service = new ConnectorService(store, undefined, root);
    await assert.rejects(service.sync(state.socialAccounts[0]!.id), /Connect before requesting sync/);
    await assert.rejects(service.start('linkedin'), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('automatic connection checks leave an unfinished provider challenge unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-connector-probe-'));
  try {
    const store = new AccountStore(root);
    let url = 'https://www.linkedin.com/checkpoint/challenge/';
    let owner = false;
    const visited: string[] = [];
    const browser = {
      currentPage: undefined as Page | undefined,
      async open() {
        const page = {
          url: () => url,
          isClosed: () => false,
          goto: async (next: string) => {
            visited.push(next);
            url = next;
          },
          locator: () => ({
            first: () => ({
              getAttribute: async () => (owner ? '/in/verified-owner/' : null),
            }),
          }),
          getByRole: () => ({
            first: () => ({
              waitFor: async () => {
                if (!owner) throw Error('No ownership');
              },
            }),
          }),
        } as unknown as Page;
        this.currentPage = page;
        return page;
      },
      async close() {
        this.currentPage = undefined;
      },
    };
    const service = new ConnectorService(store, () => browser, root);
    const started = await service.start('linkedin');
    visited.length = 0;
    const results = await Promise.all([
      service.check(started.accountId),
      service.check(started.accountId),
    ]);
    assert.deepEqual(
      results.map((result) => result.status),
      ['sign-in-open', 'sign-in-open'],
    );
    assert.deepEqual(visited, []);
    assert.equal((await store.get()).socialAccounts.length, 0);
    url = 'https://www.linkedin.com/feed/';
    owner = true;
    assert.equal((await service.check(started.accountId)).status, 'connected');
    assert.equal((await store.get()).socialAccounts.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('attached browser cleanup closes only its own tab and keeps Chrome running', async () => {
  const session = new BrowserSession();
  let tabClosed = false,
    browserKilled = false;
  Object.assign(session, {
    browser: {
      close: async () => {
        browserKilled = true;
      },
    },
    page: {
      close: async () => {
        tabClosed = true;
      },
    },
    connection: 'existing-chrome',
  });
  await session.close();
  assert.equal(tabClosed, true);
  assert.equal(browserKilled, false);
  assert.equal(session.currentPage, undefined);
});

test('reconnection polling does not interrupt an existing account MFA challenge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-reconnect-poll-'));
  try {
    const store = new AccountStore(root);
    const row = (
      await store.addSocial(0, {
        platform: 'linkedin',
        label: 'Owner',
        handle: 'verified-owner',
        profileUrl: 'https://www.linkedin.com/in/verified-owner/',
      })
    ).socialAccounts[0]!;
    let url = 'https://www.linkedin.com/checkpoint/challenge/';
    let signedIn = false;
    const visited: string[] = [];
    const browser = {
      currentPage: undefined as Page | undefined,
      async open() {
        const page = {
          url: () => url,
          isClosed: () => false,
          goto: async (next: string) => {
            visited.push(next);
            url = signedIn ? next : 'https://www.linkedin.com/checkpoint/challenge/';
          },
          locator: () => ({
            first: () => ({
              getAttribute: async () => (signedIn ? '/in/verified-owner/' : null),
            }),
          }),
          getByRole: () => ({
            first: () => ({
              waitFor: async () => {
                if (!signedIn) throw Error('MFA not complete');
              },
            }),
          }),
        } as unknown as Page;
        this.currentPage = page;
        return page;
      },
      async close() {
        this.currentPage = undefined;
      },
    };
    const service = new ConnectorService(store, () => browser, root);
    await service.begin(row.id);
    visited.length = 0;
    assert.equal((await service.check(row.id)).status, 'sign-in-open');
    assert.deepEqual(visited, [], 'automatic checking may not replace an MFA screen');
    signedIn = true;
    url = 'https://www.linkedin.com/feed/';
    assert.equal((await service.check(row.id)).status, 'connected');
    assert.equal((await service.list()).find((x) => x.id === row.id)?.status, 'connected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
