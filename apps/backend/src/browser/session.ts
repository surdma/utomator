import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { VaultPayload } from '../core/session-vault.js';
import { seedOriginStorage } from './vault-probe.js';

// Prefer Chrome that is already running with a local debugging endpoint.
// A normal Chrome window cannot be attached unless remote debugging was enabled.
const localCdpUrl = 'http://127.0.0.1:9222';

// An attached browser belongs to the desktop user, not to one automation run.
// Keep ONE CDP transport for the engine lifetime; never issue Browser.close to
// an external Chrome process. Each run owns and closes only its own tab.
let attachedBrowser: Browser | undefined;
let attachedAttempt: Promise<Browser> | undefined;
async function attachChrome(endpoint: string): Promise<Browser> {
  if (attachedBrowser?.isConnected()) return attachedBrowser;
  if (!attachedAttempt) {
    attachedAttempt = chromium
      .connectOverCDP(endpoint, { timeout: 6000 })
      .then((browser) => {
        attachedBrowser = browser;
        browser.on('disconnected', () => {
          if (attachedBrowser === browser) attachedBrowser = undefined;
          attachedAttempt = undefined;
        });
        return browser;
      })
      .catch((error) => {
        attachedAttempt = undefined;
        throw error;
      });
  }
  return attachedAttempt;
}

async function discoverRunningChrome(): Promise<string | undefined> {
  try {
    const response = await fetch(localCdpUrl + '/json/version', {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return undefined;
    const metadata = (await response.json()) as {
      webSocketDebuggerUrl?: unknown;
    };
    return typeof metadata.webSocketDebuggerUrl === 'string' ? localCdpUrl : undefined;
  } catch {
    // Nothing is listening on the debugging port; use our persisted Chrome profile.
    return undefined;
  }
}

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private connection?: 'existing-chrome' | 'persistent-profile' | 'vault-restored';
  private scratchDir?: string;

  get currentPage(): Page | undefined {
    return this.page;
  }

  get kind(): 'existing-chrome' | 'persistent-profile' | 'vault-restored' | undefined {
    return this.connection;
  }

  async open(platform: string, accountId?: string): Promise<Page> {
    if (accountId && !/^[0-9a-fA-F-]{36}$/.test(accountId))
      throw new Error('Invalid connector account ID');
    if (this.page) throw new Error('Browser session is already in use');
    // Only an explicitly opted-in local desktop may share an existing Chrome profile.
    // Remote workers and mobile browsers cannot expose their cookies through CDP.
    const attach =
      process.env.UTOMATOR_BROWSER_MODE === 'attached' &&
      process.env.HEADLESS !== 'true' &&
      !process.env.UTOMATOR_INTERNAL_OWNER_ID;
    // Never attach implicitly. The user must opt in to shared browser cookies.
    const cdpUrl =
      attach && process.env.UTOMATOR_DISABLE_CDP !== 'true'
        ? process.env.CHROME_CDP_URL?.trim() || (await discoverRunningChrome())
        : undefined;
    if (attach && !cdpUrl)
      throw Error(
        'Existing Chrome was not found. Enable loopback Chrome debugging in a local profile, or use isolated browser mode.',
      );
    if (cdpUrl) {
      const cdp = new URL(cdpUrl);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(cdp.hostname) ||
        !['http:', 'https:'].includes(cdp.protocol)
      )
        throw new Error('CDP must use loopback');
      try {
        this.browser = await attachChrome(cdpUrl);
      } catch {
        throw new Error(
          'Cannot attach to Chrome debugging session. Verify Chrome is running with a loopback CDP port, or disable CHROME_CDP_URL to use the persistent profile.',
        );
      }
      this.context = this.browser.contexts()[0];
      if (!this.context) throw new Error('CDP browser has no context');
      // Use our own tab. Never overwrite an unrelated Chrome tab.
      this.page = await this.context.newPage();
      this.connection = 'existing-chrome';
    } else {
      const dir = accountId
        ? resolve('.runtime', 'chrome', 'accounts', accountId)
        : resolve('.runtime', 'chrome', platform);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      this.context = await chromium.launchPersistentContext(dir, {
        // Hosted workers use their own Playwright-managed Chromium, never a system Chrome profile.
        ...(process.env.UTOMATOR_DISABLE_CDP === 'true' ? {} : { channel: 'chrome' }),
        headless: process.env.HEADLESS === 'true',
        viewport: { width: 1366, height: 850 },
        acceptDownloads: false,
      });
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
      this.connection = 'persistent-profile';
    }
    this.page.setDefaultTimeout(12000);
    return this.page;
  }

  /**
   * Hosted vault restore: rebuild the saved connector session inside a
   * throwaway scratch context. The vault record (snowflake DB namespace)
   * stays the only durable credential surface; this directory is deleted on close.
   * Browser hints replay LinkedIn's observed client fingerprint so a restored
   * session never presents a second tracked profile shape.
   */
  async openRestored(payload: VaultPayload): Promise<Page> {
    if (this.page) throw new Error('Browser session is already in use');
    const hints = payload.browserHints;
    const dir = resolve('.runtime', 'chrome', 'scratch', randomUUID());
    await mkdir(dir, { recursive: true, mode: 0o700 });
    this.scratchDir = dir;
    this.context = await chromium.launchPersistentContext(dir, {
      headless: process.env.HEADLESS === 'true',
      userAgent: hints.userAgent,
      viewport: { width: hints.viewport.width, height: hints.viewport.height },
      ...(hints.locale ? { locale: hints.locale } : {}),
      ...(hints.timezone ? { timezoneId: hints.timezone } : {}),
      ...(typeof hints.deviceScaleFactor === 'number'
        ? { deviceScaleFactor: hints.deviceScaleFactor }
        : {}),
      acceptDownloads: false,
    });
    if (payload.cookies.length) await this.context.addCookies(payload.cookies);
    if (payload.originState.length) {
      const page = this.context.pages()[0] ?? (await this.context.newPage());
      try {
        await seedOriginStorage(page, payload.originState);
      } finally {
        await page.close().catch(() => {});
      }
    }
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.connection = 'vault-restored';
    this.page.setDefaultTimeout(12000);
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.browser) await this.page?.close();
      else await this.context?.close();
    } finally {
      // The engine owns its tab, NEVER the attached Chrome process. The shared
      // connection intentionally persists until Chrome or this engine exits.
      // Reusing it prevents one workflow from disconnecting other active runs.
      this.page = undefined;
      this.context = undefined;
      this.browser = undefined;
      this.connection = undefined;
      // A vault scratch context is disposable: the DB record is the credential surface.
      if (this.scratchDir) {
        const scratch = this.scratchDir;
        this.scratchDir = undefined;
        await rm(scratch, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
