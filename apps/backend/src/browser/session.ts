import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { VaultPayload } from '../connect/session-vault.js';
import { runtimePath } from '../core/paths.js';
import {
  assertLoopbackCdp,
  attachChrome,
  type BrowserConnection,
  discoverRunningChrome,
  launchPersistent,
  scratchDirectory,
  startScreencast,
} from './provider.js';
import { type BrokerInput, mapBrokerInput } from './streaming-signin.js';
import { seedOriginStorage } from './vault-probe.js';

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private connection?: BrowserConnection;
  private scratchDir?: string;
  private cdp?: import('playwright').CDPSession;
  private latestFrame?: string;

  get currentPage(): Page | undefined {
    return this.page;
  }

  get kind(): BrowserConnection {
    return this.connection;
  }

  async open(platform: string, accountId?: string): Promise<Page> {
    if (accountId && !/^[0-9a-fA-F-]{36}$/.test(accountId))
      throw new Error('Invalid connector account ID');
    if (this.page) throw new Error('Browser session is already in use');
    // A local desktop uses Chrome when loopback debugging is already open.
    // Otherwise Playwright launches its own headless browser. Hosted workers never attach.
    const localDesktop = !process.env.UTOMATOR_INTERNAL_OWNER_ID;
    const attach =
      localDesktop &&
      process.env.UTOMATOR_DISABLE_CDP !== 'true' &&
      process.env.UTOMATOR_BROWSER_MODE !== 'isolated';
    const cdpUrl =
      attach && process.env.UTOMATOR_DISABLE_CDP !== 'true'
        ? process.env.CHROME_CDP_URL?.trim() || (await discoverRunningChrome())
        : undefined;
    if (cdpUrl) {
      assertLoopbackCdp(cdpUrl);
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
        ? runtimePath('chrome', 'accounts', accountId)
        : runtimePath('chrome', platform);
      this.context = await launchPersistent(dir);
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
      this.connection = 'persistent-profile';
    }
    this.page.setDefaultTimeout(12000);
    await this.beginView().catch(() => undefined);
    return this.page;
  }

  /** Stream the headless page into the Utomator window. No second browser is opened. */
  async beginView(): Promise<void> {
    if (!this.page || !this.context || this.cdp) return;
    this.cdp = await this.context.newCDPSession(this.page);
    await startScreencast(this.cdp, {}, (frame) => {
      this.latestFrame = frame.data;
    });
  }

  frame(): string | undefined {
    return this.latestFrame;
  }

  async relay(event: BrokerInput): Promise<void> {
    if (!this.cdp) await this.beginView();
    if (!this.cdp) return;
    for (const command of mapBrokerInput(event)) {
      await this.cdp.send(command.method as never, command.params as never).catch(() => undefined);
    }
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
    const dir = scratchDirectory(randomUUID());
    this.scratchDir = dir;
    this.context = await launchPersistent(dir, {
      userAgent: hints.userAgent,
      viewport: { width: hints.viewport.width, height: hints.viewport.height },
      ...(hints.locale ? { locale: hints.locale } : {}),
      ...(hints.timezone ? { timezoneId: hints.timezone } : {}),
      ...(typeof hints.deviceScaleFactor === 'number'
        ? { deviceScaleFactor: hints.deviceScaleFactor }
        : {}),
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
