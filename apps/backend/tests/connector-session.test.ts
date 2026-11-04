
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
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
    expect((await connectors.list()).find((a) => a.id === owner.id)?.status).toEqual('disconnected');
    // Instagram/GitHub/Dev.to remain queued for official API connectors.
    expect((await connectors.list()).find((a) => a.id === apiOnly.id)?.status).toEqual('api-required');
    await expect((connectors.begin(apiOnly.id))).rejects.toThrow(/official API connector/);
    await expect((connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl))).rejects.toThrow(/not verified/);
    await connectors.begin(owner.id);
    expect((await connectors.list()).find((a) => a.id === owner.id)?.status).toEqual('sign-in-open');
    const checked = await connectors.sync(owner.id);
    expect(checked.status).toEqual('connected');
    await connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl);
    await connectors.requireConnected(owner.id, 'linkedin');
    await expect((connectors.requireConnected(owner.id, 'linkedin', 'https://www.linkedin.com/in/not-owner/'))).rejects.toThrow(/does not match/);
    await expect((connectors.requireConnected(owner.id, 'x', owner.profileUrl))).rejects.toThrow(/does not match/);
    expect((await new ConnectorService(accountStore, () => browser, root).list()).find(
        (a) => a.id === owner.id,
      )?.status).toEqual('connected');
    ownPage = false;
    expect((await connectors.sync(owner.id)).status).toEqual('reconnect-required');
    // An incomplete login must leave the same browser open for MFA/retry.
    expect(browser.currentPage).toBeTruthy();
    expect((await connectors.list()).find((a) => a.id === owner.id)?.status).toEqual('sign-in-open');
    await expect((connectors.requireConnected(owner.id, 'linkedin', owner.profileUrl))).rejects.toThrow(/not verified/);
    // Closing the sign-in tab must allow another Connect action to reopen it.
    let reopened = 0;
    const oldOpen = browser.open.bind(browser);
    browser.open = async () => {
      reopened++;
      return oldOpen();
    };
    (browser.currentPage as Page & { isClosed?: () => boolean }).isClosed = () => true;
    expect((await connectors.list()).find((a) => a.id === owner.id)?.status).toEqual('disconnected');
    await connectors.begin(owner.id);
    expect(reopened).toEqual(1);
    ownPage = true;
    expect((await connectors.sync(owner.id)).status).toEqual('connected');
    await connectors.disconnect(owner.id);
    expect(browser.currentPage).toEqual(undefined);
    expect((await connectors.list()).find((a) => a.id === owner.id)?.status).toEqual('disconnected');
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
    expect(opened.status).toEqual('sign-in-open');
    expect(opened.navigationWarning ?? '').toMatch(/did not respond/);
    expect(browser.currentPage).toBeTruthy();
    expect((await service.sync(account.id)).status).toEqual('temporarily-unavailable');
    expect(browser.currentPage).toBeTruthy();
    reachable = true;
    ownerControl = true;
    expect((await service.sync(account.id)).status).toEqual('connected');
    expect((await service.list()).find((row) => row.id === account.id)?.status).toEqual('connected');
    await service.begin(account.id);
    reachable = false;
    expect((await service.sync(account.id)).status).toEqual('temporarily-unavailable');
    const restored = new ConnectorService(accounts, () => browser, root);
    expect((await restored.list()).find((row) => row.id === account.id)?.status).toEqual('connected');
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
        expect(platform).toEqual('x');
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
    expect((await service.list()).find((row) => row.id === xAccount.id)?.status).toEqual('disconnected');
    const opened = await service.begin(xAccount.id);
    expect(opened.status).toEqual('sign-in-open');
    expect((await service.list()).find((row) => row.id === xAccount.id)?.status).toEqual('sign-in-open');
    // Signed out: no owner-only control, so verification must not fake success.
    expect((await service.sync(xAccount.id)).status).toEqual('reconnect-required');
    signedIn = true;
    expect((await service.sync(xAccount.id)).status).toEqual('connected');
    expect((await service.list()).find((row) => row.id === xAccount.id)?.status).toEqual('connected');
    await service.requireConnected(xAccount.id, 'x');
    await service.requireConnected(xAccount.id, 'x', xAccount.profileUrl);
    await expect((service.requireConnected(xAccount.id, 'x', 'https://x.com/not-the-owner/'))).rejects.toThrow(/does not match/);
    // A new service instance reads the persisted record: state survives restarts.
    const restored = new ConnectorService(store, () => browser, root);
    expect((await restored.list()).find((row) => row.id === xAccount.id)?.status).toEqual('connected');
    await service.disconnect(xAccount.id);
    expect(browser.currentPage).toEqual(undefined);
    expect((await service.list()).find((row) => row.id === xAccount.id)?.status).toEqual('disconnected');
    await expect((service.requireConnected(xAccount.id, 'x'))).rejects.toThrow(/not verified/);
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
    expect(service.capabilities().mobileBrowserSession).toEqual(false);
    expect(started.status).toEqual('sign-in-open');
    expect((await store.get()).socialAccounts.length).toEqual(0);
    expect((await service.check(started.accountId)).status).toEqual('sign-in-open');
    signedIn = true;
    expect((await service.check(started.accountId)).status).toEqual('connected');
    const saved = (await store.get()).socialAccounts;
    expect(saved.length).toEqual(1);
    expect(saved[0]?.handle).toEqual('verified-owner');
    expect(saved[0]?.id).toEqual(started.accountId);
    expect((await service.list()).find((row) => row.id === started.accountId)?.status).toEqual('connected');
    await expect((service.start('linkedin'))).rejects.toThrow(/already exists/);
    await service.disconnect(started.accountId);
    await expect((service.sync(started.accountId))).rejects.toThrow(/Connect before requesting sync/);
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
    await expect((store.addSocial(a.revision, {
        platform: 'linkedin',
        label: 'Bob',
        handle: 'bob',
        profileUrl: 'https://www.linkedin.com/in/bob/',
      }))).rejects.toThrow(/Only one linked account/);
    const service = new ConnectorService(store, undefined, root);
    await expect((service.start('linkedin'))).rejects.toThrow(/already exists/);
    await expect((service.start('github'))).rejects.toThrow(/Official API connector not configured/);
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
    await expect((service.sync(state.socialAccounts[0]!.id))).rejects.toThrow(/Connect before requesting sync/);
    await expect((service.start('linkedin'))).rejects.toThrow(/already exists/);
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
    expect(results.map((result) => result.status)).toEqual(['sign-in-open', 'sign-in-open']);
    expect(visited).toEqual([]);
    expect((await store.get()).socialAccounts.length).toEqual(0);
    url = 'https://www.linkedin.com/feed/';
    owner = true;
    expect((await service.check(started.accountId)).status).toEqual('connected');
    expect((await store.get()).socialAccounts.length).toEqual(1);
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
  expect(tabClosed).toEqual(true);
  expect(browserKilled).toEqual(false);
  expect(session.currentPage).toEqual(undefined);
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
    expect((await service.check(row.id)).status).toEqual('sign-in-open');
    expect(visited).toEqual([]);
    signedIn = true;
    url = 'https://www.linkedin.com/feed/';
    expect((await service.check(row.id)).status).toEqual('connected');
    expect((await service.list()).find((x) => x.id === row.id)?.status).toEqual('connected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
