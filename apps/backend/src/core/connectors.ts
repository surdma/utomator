import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Page } from 'playwright';
import { BrowserSession } from '../browser/session.js';
import { isConnectionTimeout, navigateWithRetry } from '../browser/navigation.js';
import { AccountStore, type SocialAccount, type SocialPlatform } from '../profile/account-store.js';
import type { DocumentStore } from '../db/documents.js';

type ConnectionRecord = {
  accountId: string;
  verifiedAt: string;
  platform: string;
  handle: string;
  profileUrl: string;
};
export type ConnectionStatus = SocialAccount & {
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null;
  authentication: 'browser' | 'api-required';
  interactiveSignIn: boolean;
};
type BrowserPort = Pick<BrowserSession, 'open' | 'close'> & {
  readonly currentPage?: Page;
};
type PendingConnection = { platform: 'linkedin' | 'x'; browser: BrowserPort };
const providerHome = {
  linkedin: 'https://www.linkedin.com/feed/',
  x: 'https://x.com/home',
} as const;

const allowId = (id: string) => /^[0-9a-fA-F-]{36}$/.test(id);

/**
 * Platforms served by the conduct-based browser-session connector.
 * The connector opens an isolated Chrome profile and the account owner signs
 * in there directly; passwords are never collected and MFA/consent are never
 * bypassed. Remaining directories (instagram, github, devto) stay queued for
 * official API connectors and report `api-required`.
 */
const browserPlatforms: ReadonlySet<string> = new Set(['linkedin', 'x']);
const browserPlatform = (platform: string): boolean => browserPlatforms.has(platform);
/** HTTPS hosts each browser connector may operate on. */
const platformHosts: Record<string, ReadonlyArray<string>> = {
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  x: ['x.com', 'www.x.com'],
};
type AuditAction =
  | 'sign-in-opened'
  | 'session-verified'
  | 'reconnect-required'
  | 'temporarily-unavailable'
  | 'connection-expired'
  | 'disconnected';

export class ConnectorService {
  private readonly path: string;
  private sessions = new Map<string, BrowserPort>();
  private pending = new Map<string, PendingConnection>();
  private checks = new Map<string, Promise<{ status: string; accountId: string }>>();
  private mutation: Promise<void> = Promise.resolve();
  private documents?: DocumentStore;
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }
  constructor(
    private readonly accounts = new AccountStore(),
    private readonly makeBrowser: () => BrowserPort = () => new BrowserSession(),
    root = process.cwd(),
  ) {
    this.path = resolve(root, '.runtime', 'connectors.json');
    this.root = root;
  }
  private readonly root: string;

  private async records(): Promise<Record<string, ConnectionRecord>> {
    // Prefer the durable Drizzle document store when available.
    if (this.documents) {
      const value = await this.documents.get<Record<string, ConnectionRecord>>('connectors', 'sessions');
      if (value) return value.value;
    }
    // A hosted tenant must never inherit the local operator's connection records.
    if (this.documents?.ownerId !== 'local-owner' && this.documents) return {};
    // Fall back to JSON only for the original single-user local workspace.
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, ConnectionRecord>;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw Error('Invalid connector metadata');
      // Backfill the database from the JSON file so a later restart reads from SQL.
      if (this.documents) {
        const existing = await this.documents.get<Record<string, ConnectionRecord>>(
          'connectors',
          'sessions',
        );
        if (!existing) {
          await this.documents.put('connectors', 'sessions', raw, 0);
        }
      }
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }
  private async update(id: string, record: ConnectionRecord | null) {
    // Serialize read/modify/write so two sync requests cannot lose each other.
    const operation = this.mutation.then(async () => {
      const all = await this.records();
      if (record) all[id] = record;
      else delete all[id];
      // SQL is the source of truth once the engine has initialized a database.
      // Never write a JSON snapshot that can disagree with a failed SQL update.
      if (this.documents) {
        const existing = await this.documents.get<Record<string, ConnectionRecord>>(
          'connectors',
          'sessions',
        );
        await this.documents.put('connectors', 'sessions', all, existing?.version ?? 0);
        return;
      }
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temp = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify(all, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(temp, this.path);
      await chmod(this.path, 0o600);
    });
    this.mutation = operation.catch(() => {});
    return operation;
  }
  private async account(id: string): Promise<SocialAccount> {
    if (!allowId(id)) throw Error('Invalid connector account');
    const account = (await this.accounts.get()).socialAccounts.find((row) => row.id === id);
    if (!account) throw Error('Social account not found');
    return account;
  }
  capabilities() {
    const browserAvailable = process.env.HEADLESS !== 'true' && !process.env.UTOMATOR_INTERNAL_OWNER_ID;
    return {
      browserAvailable: Boolean(browserAvailable),
      mode: process.env.UTOMATOR_BROWSER_MODE === 'attached' ? 'attached' : 'isolated',
      mobileBrowserSession: false,
    };
  }
  async list(): Promise<ConnectionStatus[]> {
    for (const [id, entry] of this.pending) {
      if (entry.browser.currentPage?.isClosed?.()) {
        this.pending.delete(id);
        await entry.browser.close().catch(() => {});
      }
    }
    const [accounts, records] = await Promise.all([this.accounts.get(), this.records()]);
    const saved: ConnectionStatus[] = accounts.socialAccounts.map((row) => {
      const browser = browserPlatform(row.platform);
      const verified = records[row.id];
      // Legacy duplicates are kept for explicit cleanup, but cannot both be marked usable.
      const unique =
        accounts.socialAccounts.filter((item) => item.platform === row.platform).length === 1;
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
          : this.sessions.has(row.id) && !this.sessions.get(row.id)?.currentPage?.isClosed?.()
            ? 'sign-in-open'
            : connected
              ? 'connected'
              : 'disconnected',
        verifiedAt: connected ? verified.verifiedAt : null,
        authentication: browser ? 'browser' : 'api-required',
        interactiveSignIn: browser && process.env.HEADLESS !== 'true',
      };
    });
    // The pending row is not an account. No handle is exposed until provider verification.
    const pending: ConnectionStatus[] = [...this.pending].map(([id, entry]) => ({
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
    return [...saved, ...pending];
  }
  async requireConnected(id: string, platform: string, profileUrl?: string): Promise<SocialAccount> {
    const row = await this.account(id);
    if (
      (await this.accounts.get()).socialAccounts.filter((item) => item.platform === platform).length > 1
    )
      throw Error('Legacy duplicate accounts must be resolved before running workflows');
    const records = await this.records();
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
  // Unlike the legacy connect-by-account-ID route, this starts with no identity.
  // Account identity is learned exclusively from an authenticated provider page.
  async start(platform: SocialPlatform) {
    if (platform !== 'linkedin' && platform !== 'x')
      throw Error('Official API connector not configured for this network');
    if (!this.capabilities().browserAvailable)
      throw Error(
        'Interactive sign-in requires a local desktop agent; mobile and hosted browser sessions cannot be shared',
      );
    if ((await this.accounts.get()).socialAccounts.some((item) => item.platform === platform))
      throw Error('A profile for this network already exists. Reconnect or remove it first.');
    if ([...this.pending.values()].some((entry) => entry.platform === platform))
      throw Error('A connection for this network is already in progress');
    const id = randomUUID();
    const browser = this.makeBrowser();
    this.pending.set(id, { platform, browser });
    try {
      const page = await browser.open(platform, id);
      await navigateWithRetry(page, providerHome[platform], {
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
      this.pending.delete(id);
      await browser.close().catch(() => {});
      await rm(resolve(this.root, '.runtime', 'chrome', 'accounts', id), {
        recursive: true,
        force: true,
      });
      throw error;
    }
  }

  // Extract only an owner-navigation link from an authenticated provider page.
  // Never infer the account from a URL typed into Utomator or a public search result.
  private async discover(page: Page, platform: 'linkedin' | 'x') {
    // Never navigate away from a login, MFA or consent page while checking.
    const here = new URL(page.url());
    const trustedHosts = platformHosts[platform];
    if (!trustedHosts || here.protocol !== 'https:' || !trustedHosts.includes(here.hostname))
      throw Error('Provider sign-in is not complete');
    const candidates =
      platform === 'linkedin'
        ? [
            'a[data-control-name="identity_profile_photo"][href*="/in/"]',
            '.feed-identity-module a[href*="/in/"]',
            'a.global-nav__secondary-item[href*="/in/"]',
          ]
        : ['a[data-testid="AppTabBar_Profile_Link"]'];
    let profileUrl: URL | null = null;
    for (const selector of candidates) {
      const href = await page
        .locator(selector)
        .first()
        .getAttribute('href', { timeout: 1500 })
        .catch(() => null);
      if (!href) continue;
      try {
        const candidate = new URL(href, here.origin);
        if (
          candidate.protocol !== 'https:' ||
          !trustedHosts.includes(candidate.hostname) ||
          candidate.search ||
          candidate.hash ||
          candidate.username ||
          candidate.password ||
          candidate.port
        )
          continue;
        const path =
          platform === 'linkedin' ? /^\/in\/([a-zA-Z0-9_-]{3,100})\/?$/ : /^\/([a-zA-Z0-9_]{1,15})\/?$/;
        if (!path.test(candidate.pathname)) continue;
        profileUrl = candidate;
        break;
      } catch {
        /* Invalid provider link is not owner identity evidence. */
      }
    }
    if (!profileUrl) return null; // Not signed in yet. Leave the page intact.
    const handle = profileUrl.pathname.split('/').filter(Boolean).at(-1);
    if (!handle) return null;
    const normalized =
      platform === 'linkedin' ? `https://www.linkedin.com/in/${handle}/` : `https://x.com/${handle}`;
    // Prove ownership at the discovered profile before it is persisted.
    const verified = await this.verify(page, {
      id: '',
      platform,
      label: handle,
      handle,
      profileUrl: normalized,
    });
    if (verified === 'temporarily-unavailable') return null;
    if (verified !== 'verified') throw Error('Provider profile ownership could not be verified');
    return { platform, label: handle, handle, profileUrl: normalized };
  }

  async begin(id: string) {
    const account = await this.account(id);
    if (
      (await this.accounts.get()).socialAccounts.filter((item) => item.platform === account.platform)
        .length > 1
    )
      throw Error('Legacy duplicate accounts must be resolved before reconnecting');
    // A hosted headless worker cannot present the provider's sign-in or MFA
    // screen on the owner's device. Never announce that a remote window opened.
    if (!this.capabilities().browserAvailable)
      throw Error(
        'Interactive browser sign-in requires a local desktop agent. Hosted and mobile sessions cannot be shared.',
      );
    const network = platformLabel(account.platform);
    if (!browserPlatform(account.platform)) {
      throw Error('This network requires an official API connector. Browser login is not offered.');
    }
    // A user may close the isolated Chrome window before finishing login.
    // Never advertise sign-in-open for an already closed tab.
    const pending = this.sessions.get(id);
    if (pending?.currentPage?.isClosed?.()) {
      this.sessions.delete(id);
      await pending.close().catch(() => {});
    }
    if (this.sessions.has(id)) return { status: 'sign-in-open', accountId: id };
    const browser = this.makeBrowser();
    this.sessions.set(id, browser);
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
        // Navigation can fail even when the isolated Chrome window is usable.
        // Keep it open for the owner to retry from Chrome, not the backend.
        await this.audit('sign-in-opened', account);
        return {
          status: 'sign-in-open' as const,
          accountId: id,
          navigationWarning:
            network +
            ' did not respond. Check the network in the open Chrome window, then try Sync again.',
        };
      }
      await this.audit('sign-in-opened', account);
      return { status: 'sign-in-open' as const, accountId: id };
    } catch (e) {
      this.sessions.delete(id);
      await browser.close().catch(() => {});
      if (isConnectionTimeout(e)) {
        throw Error(
          'Cannot reach ' +
            network +
            '. Verify Chrome is running with a loopback CDP port (127.0.0.1:9222) ' +
            'or that the persistent Chrome profile can launch, then retry Connect.',
        );
      }
      throw e;
    }
  }
  async check(id: string): Promise<{ status: string; accountId: string }> {
    const inFlight = this.checks.get(id);
    if (inFlight) return inFlight;
    const attempt = (
      this.pending.has(id)
        ? this.sync(id)
        : this.sessions.has(id)
          ? this.checkExistingSignIn(id)
          : this.sync(id)
    ).finally(() => this.checks.delete(id));
    this.checks.set(id, attempt);
    return attempt;
  }
  private async checkExistingSignIn(id: string) {
    const account = await this.account(id);
    const browser = this.sessions.get(id);
    const page = browser?.currentPage;
    if (!page || page.isClosed?.()) return { status: 'reconnect-required' as const, accountId: id };
    const here = new URL(page.url());
    const target = new URL(account.profileUrl);
    if (here.protocol !== 'https:' || !platformHosts[account.platform]?.includes(here.hostname))
      return { status: 'sign-in-open' as const, accountId: id };
    const onOwnedProfile = here.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '');
    if (onOwnedProfile) {
      const outcome = await this.verify(page, account, false);
      if (outcome !== 'verified')
        return {
          status:
            outcome === 'temporarily-unavailable'
              ? ('temporarily-unavailable' as const)
              : ('sign-in-open' as const),
          accountId: id,
        };
    } else {
      // A provider home page can expose the signed-in user's self-profile link.
      // Login/MFA pages do not; never navigate away from them while polling.
      const owner = await this.discover(page, account.platform as 'linkedin' | 'x').catch(() => null);
      if (!owner) return { status: 'sign-in-open' as const, accountId: id };
      if (owner.profileUrl !== account.profileUrl)
        return { status: 'reconnect-required' as const, accountId: id };
    }
    await this.update(id, {
      accountId: id,
      verifiedAt: new Date().toISOString(),
      platform: account.platform,
      handle: account.handle,
      profileUrl: account.profileUrl,
    });
    this.sessions.delete(id);
    await browser?.close().catch(() => {});
    await this.audit('session-verified', account);
    return { status: 'connected' as const, accountId: id };
  }
  async sync(id: string) {
    const pending = this.pending.get(id);
    if (pending) {
      const page = pending.browser.currentPage;
      if (!page || page.isClosed?.()) throw Error('Connection window is closed. Connect again.');
      let identity: Awaited<ReturnType<ConnectorService['discover']>>;
      try {
        identity = await this.discover(page, pending.platform);
      } catch (error) {
        if (isConnectionTimeout(error))
          return { status: 'temporarily-unavailable' as const, accountId: id };
        throw error;
      }
      if (!identity) return { status: 'sign-in-open' as const, accountId: id };
      await this.accounts.linkVerifiedSocial(id, identity);
      await this.update(id, {
        accountId: id,
        verifiedAt: new Date().toISOString(),
        ...identity,
      });
      this.pending.delete(id);
      await pending.browser.close().catch(() => {});
      return { status: 'connected' as const, accountId: id };
    }
    const account = await this.account(id);
    if (
      (await this.accounts.get()).socialAccounts.filter((item) => item.platform === account.platform)
        .length > 1
    )
      throw Error('Legacy duplicate accounts must be resolved before syncing');
    const current = await this.records();
    const session = this.sessions.get(id);
    const matching =
      current[id]?.platform === account.platform &&
      current[id]?.handle === account.handle &&
      current[id]?.profileUrl === account.profileUrl;
    if (!session && !matching) throw Error('Account is disconnected. Connect before requesting sync.');
    if (!browserPlatform(account.platform)) throw Error('Official API connector not configured');
    const browser = this.sessions.get(id) || this.makeBrowser();
    if (!this.sessions.has(id)) this.sessions.set(id, browser);
    let keepWindowOpen = false;
    try {
      const page = browser.currentPage || (await browser.open(account.platform, id));
      const outcome = await this.verify(page, account);
      if (outcome === 'temporarily-unavailable') {
        // Transient network failure is not evidence that the stored session expired.
        keepWindowOpen = true;
        await this.audit('temporarily-unavailable', account);
        return { status: 'temporarily-unavailable' as const, accountId: id };
      }
      if (outcome !== 'verified') {
        // MFA or a slow sign-in may not be finished. Keep the existing tab open
        // so the user can complete authentication and retry Verify & sync.
        await this.update(id, null);
        keepWindowOpen = true;
        await this.audit('reconnect-required', account);
        return { status: 'reconnect-required' as const, accountId: id };
      }
      await this.update(id, {
        accountId: id,
        verifiedAt: new Date().toISOString(),
        platform: account.platform,
        handle: account.handle,
        profileUrl: account.profileUrl,
      });
      await this.audit('session-verified', account);
      return { status: 'connected' as const, accountId: id };
    } finally {
      if (!keepWindowOpen) {
        this.sessions.delete(id);
        await browser.close().catch(() => {});
      }
    }
  }
  async verify(
    page: Page,
    account: SocialAccount,
    navigate = true,
  ): Promise<'verified' | 'not-authenticated' | 'temporarily-unavailable'> {
    try {
      if (navigate)
        await navigateWithRetry(page, account.profileUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
          maxAttempts: 2,
          baseDelayMs: 400,
        });
    } catch (error) {
      if (isConnectionTimeout(error)) return 'temporarily-unavailable';
      throw error;
    }
    const isOwnedProfilePage = () => {
      const url = new URL(page.url());
      const hosts = platformHosts[account.platform] ?? [];
      return (
        hosts.includes(url.hostname) &&
        url.protocol === 'https:' &&
        url.pathname.replace(/\/$/, '') === new URL(account.profileUrl).pathname.replace(/\/$/, '')
      );
    };
    if (!isOwnedProfilePage()) return 'not-authenticated';
    // Only a control the account owner can see proves an authenticated session:
    //   LinkedIn  â€“ the "Edit intro" button on the owned profile
    //   X         â€“ the "Edit profile" link on the owned profile
    // A signed-out visitor sees "Follow" buttons instead, never these controls.
    const ownerOnlyControl =
      account.platform === 'x'
        ? page.getByRole('link', { name: /edit profile/i })
        : page.getByRole('button', { name: /edit intro/i });
    // DOMContentLoaded fires before the provider's profile controls finish
    // rendering. Wait for the actual owner-only control instead of requiring a
    // page refresh. Verification failures degrade to reconnect-required.
    try {
      await ownerOnlyControl.first().waitFor({ state: 'visible', timeout: 8000 });
      return isOwnedProfilePage() ? 'verified' : 'not-authenticated';
    } catch {
      return 'not-authenticated';
    }
  }
  async expire(id: string) {
    if (allowId(id)) {
      try {
        const accounts = await this.accounts.get();
        const row = accounts.socialAccounts.find((item) => item.id === id);
        if (row) await this.audit('connection-expired', row);
      } catch {
        // The store may be unreadable while its data directory is absent; expire must still run.
      }
      await this.update(id, null);
    }
  }
  async disconnect(id: string) {
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      await pending.browser.close().catch(() => {});
      await rm(resolve(this.root, '.runtime', 'chrome', 'accounts', id), {
        recursive: true,
        force: true,
      });
      return { status: 'disconnected' as const, accountId: id };
    }
    const account = await this.account(id);
    const browser = this.sessions.get(id);
    if (browser) {
      this.sessions.delete(id);
      await browser.close();
    }
    await this.update(id, null);
    // Deleting the isolated Chrome profile clears its session cookies, which is
    // the connector's complete stored credential surface. Nothing else persists.
    await rm(resolve(this.root, '.runtime', 'chrome', 'accounts', id), {
      recursive: true,
      force: true,
    });
    await this.audit('disconnected', account);
    return { status: 'disconnected' as const, accountId: id };
  }
  private async audit(action: AuditAction, account?: SocialAccount) {
    if (!this.documents) return; // local JSON workspace: the connector state itself is the record
    try {
      const existing = await this.documents.get<
        Array<{
          time: string;
          accountId: string;
          platform: string;
          action: AuditAction;
        }>
      >('connectors', 'audit');
      const entries = existing?.value ?? [];
      entries.push({
        time: new Date().toISOString(),
        accountId: account?.id ?? '-',
        platform: account?.platform ?? '-',
        action,
      });
      await this.documents.put('connectors', 'audit', entries.slice(-200), existing?.version ?? 0);
    } catch {
      // An audit failure must never block connection management; state persists in connectors store.
    }
  }
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'linkedin':
      return 'LinkedIn';
    case 'x':
      return 'X';
    case 'instagram':
      return 'Instagram';
    case 'github':
      return 'GitHub';
    case 'devto':
      return 'Dev.to';
    default:
      return platform;
  }
}
