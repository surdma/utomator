import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { isConnectionTimeout, navigateWithRetry, streamSignInUrl } from '../browser/navigation.js';
import type { BrowserPort } from '../browser/provider.js';
import { BrowserSession } from '../browser/session.js';
import type { BrokerInput } from '../browser/streaming-signin.js';
import type { AccountStore, SocialAccount, SocialPlatform } from '../profile/account-store.js';
import {
  type AuditAction,
  allowId,
  browserPlatform,
  platformLabel,
  providerHome,
} from './connector-consts.js';
import type { ConnectorRecordStore } from './store.js';

export type SessionDeps = {
  accounts: AccountStore;
  store: ConnectorRecordStore;
  sessions: Map<string, BrowserPort>;
  pending: Map<string, { platform: 'linkedin' | 'x'; browser: BrowserPort }>;
  makeBrowser: () => BrowserPort;
  root: string;
  audit: (action: AuditAction, account?: SocialAccount) => Promise<void>;
};

/** Browser lifecycle for connector sign-in, re-verify, expire, and disconnect. */
export class ConnectorSession {
  constructor(private readonly deps: SessionDeps) {}

  private async account(id: string): Promise<SocialAccount> {
    const { accounts } = this.deps;
    if (!allowId(id)) throw Error('Invalid connector account');
    const row = (await accounts.get()).socialAccounts.find((row) => row.id === id);
    if (!row) throw Error('Social account not found');
    return row;
  }

  private liveBrowser(id: string): BrowserSession | undefined {
    const { pending, sessions } = this.deps;
    const pendingBrowser = pending.get(id)?.browser;
    const session = sessions.get(id);
    const browser = pendingBrowser || session;
    return browser instanceof BrowserSession ? browser : undefined;
  }

  // Unlike the legacy connect-by-account-ID route, this starts with no identity.
  // Account identity is learned exclusively from an authenticated provider page.
  async start(platform: SocialPlatform) {
    const { accounts, pending, makeBrowser, root } = this.deps;
    if (platform !== 'linkedin' && platform !== 'x')
      throw Error('Official API connector not configured for this network');
    if (process.env.UTOMATOR_INTERNAL_OWNER_ID)
      throw Error(
        'Interactive sign-in requires a local desktop agent; mobile and hosted browser sessions cannot be shared',
      );
    if ((await accounts.get()).socialAccounts.some((item) => item.platform === platform))
      throw Error('A profile for this network already exists. Reconnect or remove it first.');
    if ([...pending.values()].some((entry) => entry.platform === platform))
      throw Error('A connection for this network is already in progress');
    const id = randomUUID();
    const browser = makeBrowser();
    pending.set(id, { platform, browser });
    try {
      const page = await browser.open(platform, id);
      await navigateWithRetry(page, streamSignInUrl[platform], {
        waitUntil: 'domcontentloaded',
        timeout: 12000,
        maxAttempts: 2,
        baseDelayMs: 400,
      });
      return { status: 'sign-in-open' as const, accountId: id };
    } catch (error) {
      if (isConnectionTimeout(error) && browser.currentPage) {
        return {
          status: 'sign-in-open' as const,
          accountId: id,
          navigationWarning: 'The provider did not respond. Complete sign-in in Chrome, then verify.',
        };
      }
      pending.delete(id);
      await browser.close().catch(() => {});
      await rm(resolve(root, '.runtime', 'chrome', 'accounts', id), {
        recursive: true,
        force: true,
      });
      throw error;
    }
  }

  async begin(id: string) {
    const { accounts, sessions, makeBrowser, audit } = this.deps;
    const account = await this.account(id);
    if (
      (await this.deps.accounts.get()).socialAccounts.filter(
        (item) => item.platform === account.platform,
      ).length > 1
    )
      throw Error('Legacy duplicate accounts must be resolved before reconnecting');
    if (process.env.UTOMATOR_INTERNAL_OWNER_ID)
      throw Error(
        'Interactive browser sign-in requires a local desktop agent. Hosted and mobile sessions cannot be shared.',
      );
    if (!browserPlatform(account.platform)) {
      throw Error('This network requires an official API connector. Browser login is not offered.');
    }
    const pending = this.deps.sessions.get(id);
    if (pending?.currentPage?.isClosed?.()) {
      this.deps.sessions.delete(id);
      await pending.close().catch(() => {});
    }
    if (this.deps.sessions.has(id)) return { status: 'sign-in-open', accountId: id };
    const browser = makeBrowser();
    this.deps.sessions.set(id, browser);
    try {
      const page = await browser.open(account.platform, id);
      try {
        await navigateWithRetry(page, account.profileUrl, {
          waitUntil: 'commit',
          timeout: 12000,
          maxAttempts: 2,
          baseDelayMs: 400,
        });
      } catch (error) {
        if (!isConnectionTimeout(error)) throw error;
        await this.deps.audit('sign-in-opened', account);
        return {
          status: 'sign-in-open' as const,
          accountId: id,
          navigationWarning:
            platformLabel(account.platform) +
            ' did not respond. Check the network in the open Chrome window, then try Sync again.',
        };
      }
      await this.deps.audit('sign-in-opened', account);
      return { status: 'sign-in-open' as const, accountId: id };
    } catch (e) {
      this.deps.sessions.delete(id);
      await browser.close().catch(() => {});
      if (isConnectionTimeout(e)) {
        throw Error(
          'Cannot reach ' +
            platformLabel(account.platform) +
            '. Verify Chrome is running with a loopback CDP port (127.0.0.1:9222) ' +
            'or that the persistent Chrome profile can launch, then retry Connect.',
        );
      }
      throw e;
    }
  }

  async signInFrame(id: string): Promise<{ frame: string | null; status: string }> {
    const { pending, sessions } = this.deps;
    const browser = this.liveBrowser(id);
    if (!browser?.currentPage) return { frame: null, status: 'closed' };
    await browser.beginView().catch(() => undefined);
    return { frame: browser.frame() ?? null, status: 'sign-in-open' };
  }

  async signInInput(id: string, event: BrokerInput): Promise<void> {
    const { pending, sessions } = this.deps;
    const browser = this.liveBrowser(id);
    if (!browser?.currentPage) throw Error('Sign-in is not open');
    await browser.relay(event);
  }

  async expire(id: string) {
    const { store, accounts, pending, root } = this.deps;
    if (allowId(id)) {
      try {
        const accountsList = await accounts.get();
        const row = accountsList.socialAccounts.find((item) => item.id === id);
        if (row) await this.deps.audit('connection-expired', row);
      } catch {
        // The store may be unreadable while its data directory is absent; expire must still run.
      }
      await store.update(id, null);
    }
  }

  async disconnect(id: string) {
    const { pending, sessions, store, root, audit } = this.deps;
    const entry = pending.get(id);
    if (entry) {
      pending.delete(id);
      await entry.browser.close().catch(() => {});
      await rm(resolve(root, '.runtime', 'chrome', 'accounts', id), {
        recursive: true,
        force: true,
      });
      return { status: 'disconnected' as const, accountId: id };
    }
    const account = await this.account(id);
    const browser = sessions.get(id);
    if (browser) {
      sessions.delete(id);
      await browser.close();
    }
    await store.update(id, null);
    // Deleting the isolated Chrome profile clears its session cookies, which is
    // the connector's complete stored credential surface. Nothing else persists.
    await rm(resolve(root, '.runtime', 'chrome', 'accounts', id), {
      recursive: true,
      force: true,
    });
    await audit('disconnected', account);
    return { status: 'disconnected' as const, accountId: id };
  }
}
