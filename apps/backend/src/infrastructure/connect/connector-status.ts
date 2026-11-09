import type { BrowserPort } from '../browser/provider.js';
import type { AccountStore, SocialAccount, SocialPlatform } from '../profile/account-store.js';
import { browserPlatform } from './connector-consts.js';
import type { ConnectionRecord, ConnectorRecordStore } from './store.js';

export type ConnectionStatus = SocialAccount & {
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null;
  authentication: 'browser' | 'api-required';
  interactiveSignIn: boolean;
};

export type StatusDeps = {
  accounts: AccountStore;
  store: ConnectorRecordStore;
  sessions: Map<string, BrowserPort>;
  pending: Map<string, { platform: 'linkedin' | 'x'; browser: BrowserPort }>;
};

/** Read-only connection status computation: account listing, session checks,
 *  and the requireConnected guard used before workflows start. */
export class ConnectorStatus {
  constructor(private readonly deps: StatusDeps) {}

  capabilities() {
    const browserAvailable = !process.env.UTOMATOR_INTERNAL_OWNER_ID;
    return {
      browserAvailable: Boolean(browserAvailable),
      mode: process.env.UTOMATOR_BROWSER_MODE === 'attached' ? 'attached' : 'isolated',
      mobileBrowserSession: false,
    };
  }

  async list(): Promise<ConnectionStatus[]> {
    const { pending, sessions, accounts, store } = this.deps;
    for (const [id, entry] of pending) {
      if (entry.browser.currentPage?.isClosed?.()) {
        pending.delete(id);
        await entry.browser.close().catch(() => {});
      }
    }
    const [accountRows, records] = await Promise.all([accounts.get(), store.get()]);
    const saved: ConnectionStatus[] = accountRows.socialAccounts.map((row) => {
      const browser = browserPlatform(row.platform);
      const verified = records[row.id];
      const unique =
        accountRows.socialAccounts.filter((item) => item.platform === row.platform).length === 1;
      const connected =
        unique &&
        browser &&
        verified?.platform === row.platform &&
        verified.handle === row.handle &&
        verified.profileUrl === row.profileUrl;
      return {
        ...row,
        status: !browser
          ? 'api-required'
          : sessions.has(row.id) && !sessions.get(row.id)?.currentPage?.isClosed?.()
            ? 'sign-in-open'
            : connected
              ? 'connected'
              : 'disconnected',
        verifiedAt: connected ? verified.verifiedAt : null,
        authentication: browser ? 'browser' : 'api-required',
        interactiveSignIn: browser && process.env.HEADLESS !== 'true',
      };
    });
    const pendingRows: ConnectionStatus[] = [...pending].map(([id, entry]) => ({
      id,
      platform: entry.platform,
      label: 'Sign-in in progress',
      handle: '',
      profileUrl: '',
      status: 'sign-in-open',
      verifiedAt: null,
      authentication: 'browser',
      interactiveSignIn: process.env.HEADLESS !== 'true',
    }));
    return [...saved, ...pendingRows];
  }

  async requireConnected(id: string, platform: string, profileUrl?: string): Promise<SocialAccount> {
    const { accounts, store } = this.deps;
    const row = await this.account(id);
    if ((await accounts.get()).socialAccounts.filter((item) => item.platform === platform).length > 1)
      throw Error('Legacy duplicate accounts must be resolved before running workflows');
    const records = await store.get();
    const record = records[id];
    if (row.platform !== platform)
      throw Error('Selected connection does not match the workflow profile');
    if (profileUrl !== undefined) {
      let supplied: URL;
      try {
        supplied = new URL(profileUrl);
      } catch {
        throw Error('Selected connection does not match the workflow profile');
      }
      const expected = new URL(row.profileUrl);
      if (
        supplied.protocol !== 'https:' ||
        supplied.username ||
        supplied.password ||
        supplied.port ||
        supplied.search ||
        supplied.hash ||
        supplied.hostname !== expected.hostname ||
        supplied.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')
      )
        throw Error('Selected connection does not match the workflow profile');
    }
    if (
      !browserPlatform(row.platform) ||
      !record ||
      record.handle !== row.handle ||
      record.platform !== row.platform ||
      record.profileUrl !== row.profileUrl
    )
      throw Error('Connection is not verified. Connect and sync before starting.');
    return row;
  }

  private async account(id: string): Promise<SocialAccount> {
    const { accounts } = this.deps;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) throw Error('Invalid connector account');
    const row = (await accounts.get()).socialAccounts.find((row) => row.id === id);
    if (!row) throw Error('Social account not found');
    return row;
  }
}
