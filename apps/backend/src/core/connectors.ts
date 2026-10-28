import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Page } from 'playwright';
import { BrowserSession } from '../browser/session.js';
import { AccountStore, type SocialAccount } from '../profile/account-store.js';
import type {DocumentStore} from '../db/documents.js';

type ConnectionRecord = {
  accountId: string; verifiedAt: string; platform: string; handle: string; profileUrl: string;
};
export type ConnectionStatus = SocialAccount & {
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null; authentication: 'browser' | 'api-required';
  interactiveSignIn: boolean;
};
type BrowserPort = Pick<BrowserSession, 'open' | 'close'> & { readonly currentPage?: Page };
const allowId = (id: string) => /^[0-9a-fA-F-]{36}$/.test(id);
const isConnectionTimeout = (error: unknown): boolean =>
  error instanceof Error && /net::ERR_CONNECTION_TIMED_OUT|net::ERR_CONNECTION_REFUSED|net::ERR_NAME_NOT_RESOLVED/i.test(error.message);

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
  | 'sign-in-opened' | 'session-verified' | 'reconnect-required'
  | 'temporarily-unavailable' | 'connection-expired' | 'disconnected';

/**
 * Navigate with exponential backoff retries. The first attempt uses the
 * caller-supplied timeout; subsequent attempts double the wait between tries.
 * Never retries navigation that left the official platform.
 */
async function navigateWithRetry(
  page: Page,
  url: string,
  opts: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
  } = {},
): Promise<void> {
  const { waitUntil, timeout, maxAttempts = 3, baseDelayMs = 2000 } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      if (!isConnectionTimeout(error)) break; // non-network errors are not retried
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}
export class ConnectorService {
  private readonly path: string;
  private sessions = new Map<string, BrowserPort>();
  private mutation: Promise<void> = Promise.resolve();
  private documents?:DocumentStore;
  setDocuments(documents:DocumentStore){this.documents=documents;}
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
    if(this.documents?.ownerId!=='local-owner' && this.documents)return {};
    // Fall back to JSON only for the original single-user local workspace.
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, ConnectionRecord>;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid connector metadata');
      // Backfill the database from the JSON file so a later restart reads from SQL.
      if (this.documents) {
        const existing = await this.documents.get<Record<string, ConnectionRecord>>('connectors', 'sessions');
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
        const existing = await this.documents.get<Record<string, ConnectionRecord>>('connectors', 'sessions');
        await this.documents.put('connectors', 'sessions', all, existing?.version ?? 0);
        return;
      }
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temp = this.path + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
      await rename(temp, this.path);
      await chmod(this.path, 0o600);
    });
    this.mutation = operation.catch(() => {});
    return operation;
  }
  private async account(id: string): Promise<SocialAccount> {
    if (!allowId(id)) throw Error('Invalid connector account');
    const account = (await this.accounts.get()).socialAccounts.find(row => row.id === id);
    if (!account) throw Error('Social account not found');
    return account;
  }
  async list(): Promise<ConnectionStatus[]> {
    const [accounts, records] = await Promise.all([this.accounts.get(), this.records()]);
    return accounts.socialAccounts.map(row => {
      const browser = browserPlatform(row.platform);
      const verified = records[row.id];
      const connected = browser && verified?.platform === row.platform &&
        verified.handle === row.handle && verified.profileUrl === row.profileUrl;
      return {
        ...row,
        status: !browser ? 'api-required' :
          (this.sessions.has(row.id) && !this.sessions.get(row.id)?.currentPage?.isClosed?.())
            ? 'sign-in-open' : connected ? 'connected' : 'disconnected',
        verifiedAt: connected ? verified.verifiedAt : null,
        authentication: browser ? 'browser' : 'api-required',
        interactiveSignIn: browser && process.env.HEADLESS !== 'true',
      };
    });
  }
  async requireConnected(id: string, platform: string, profileUrl?: string): Promise<SocialAccount> {
    const row = await this.account(id);
    const records = await this.records();
    const record = records[id];
    if (row.platform !== platform) throw Error('Selected connection does not match the workflow profile');
    if (profileUrl !== undefined) {
      let supplied: URL;
      try { supplied = new URL(profileUrl); }
      catch { throw Error('Selected connection does not match the workflow profile'); }
      const expected = new URL(row.profileUrl);
      if (supplied.protocol !== 'https:' || supplied.username || supplied.password ||
          supplied.port || supplied.search || supplied.hash ||
          supplied.hostname !== expected.hostname ||
          supplied.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, ''))
        throw Error('Selected connection does not match the workflow profile');
    }
    if (!browserPlatform(row.platform) || !record || record.handle !== row.handle ||
      record.platform !== row.platform || record.profileUrl !== row.profileUrl) throw Error('Connection is not verified. Connect and sync before starting.');
    return row;
  }
  async begin(id: string) {
    const account = await this.account(id);
    // A hosted headless worker cannot present the provider's sign-in or MFA
    // screen on the owner's device. Never announce that a remote window opened.
    if(process.env.HEADLESS==='true'&&process.env.UTOMATOR_INTERNAL_OWNER_ID)
      throw Error('Interactive browser sign-in is unavailable on this hosted server. Use supported LinkedIn OAuth for publishing; browser workflows require an interactive connection host.');
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
          status: 'sign-in-open' as const, accountId: id,
          navigationWarning: network + ' did not respond. Check the network in the open Chrome window, then try Sync again.',
        };
      }
      await this.audit('sign-in-opened', account);
      return { status: 'sign-in-open' as const, accountId: id };
    } catch (e) {
      this.sessions.delete(id);
      await browser.close().catch(() => {});
      if (isConnectionTimeout(e)) {
        throw Error(
          'Cannot reach ' + network + '. Verify Chrome is running with a loopback CDP port (127.0.0.1:9222) ' +
          'or that the persistent Chrome profile can launch, then retry Connect.',
        );
      }
      throw e;
    }
  }
  async sync(id: string) {
    const account = await this.account(id);
    if (!browserPlatform(account.platform)) throw Error('Official API connector not configured');
    const browser = this.sessions.get(id) || this.makeBrowser();
    if (!this.sessions.has(id)) this.sessions.set(id, browser);
    let keepWindowOpen = false;
    try {
      const page = browser.currentPage || await browser.open(account.platform, id);
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
      await this.update(id, { accountId: id, verifiedAt: new Date().toISOString(),
        platform: account.platform, handle: account.handle, profileUrl: account.profileUrl });
      await this.audit('session-verified', account);
      return { status: 'connected' as const, accountId: id };
    } finally {
      if (!keepWindowOpen) {
        this.sessions.delete(id);
        await browser.close().catch(() => {});
      }
    }
  }
  async verify(page: Page, account: SocialAccount): Promise<'verified' | 'not-authenticated' | 'temporarily-unavailable'> {
    try {
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
      return hosts.includes(url.hostname) &&
        url.protocol === 'https:' &&
        url.pathname.replace(/\/$/, '') === new URL(account.profileUrl).pathname.replace(/\/$/, '');
    };
    if (!isOwnedProfilePage()) return 'not-authenticated';
    // Only a control the account owner can see proves an authenticated session:
    //   LinkedIn  – the "Edit intro" button on the owned profile
    //   X         – the "Edit profile" link on the owned profile
    // A signed-out visitor sees "Follow" buttons instead, never these controls.
    const ownerOnlyControl = account.platform === 'x'
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
        const row = accounts.socialAccounts.find(item => item.id === id);
        if (row) await this.audit('connection-expired', row);
      } catch {
        // The store may be unreadable while its data directory is absent; expire must still run.
      }
      await this.update(id, null);
    }
  }
  async disconnect(id: string) {
    const account = await this.account(id);
    if (this.sessions.has(id)) {
      const browser = this.sessions.get(id)!;
      this.sessions.delete(id);
      await browser.close();
    }
    await this.update(id, null);
    // Deleting the isolated Chrome profile clears its session cookies, which is
    // the connector's complete stored credential surface. Nothing else persists.
    await rm(resolve(this.root, '.runtime', 'chrome', 'accounts', id), { recursive: true, force: true });
    await this.audit('disconnected', account);
    return { status: 'disconnected' as const, accountId: id };
  }
  private async audit(action: AuditAction, account?: SocialAccount) {
    if (!this.documents) return; // local JSON workspace: the connector state itself is the record
    try {
      const existing = await this.documents
        .get<Array<{ time: string; accountId: string; platform: string; action: AuditAction }>>('connectors', 'audit');
      const entries = existing?.value ?? [];
      entries.push({
        time: new Date().toISOString(), accountId: account?.id ?? '-',
        platform: account?.platform ?? '-', action,
      });
      await this.documents.put('connectors', 'audit', entries.slice(-200), existing?.version ?? 0);
    } catch {
      // An audit failure must never block connection management; state persists in connectors store.
    }
  }
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'linkedin': return 'LinkedIn';
    case 'x': return 'X';
    case 'instagram': return 'Instagram';
    case 'github': return 'GitHub';
    case 'devto': return 'Dev.to';
    default: return platform;
  }
}
