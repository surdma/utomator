import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// Prefer Chrome that is already running with a local debugging endpoint.
// A normal Chrome window cannot be attached unless remote debugging was enabled.
const localCdpUrl = 'http://127.0.0.1:9222';

async function discoverRunningChrome(): Promise<string | undefined> {
  try {
    const response = await fetch(localCdpUrl + '/json/version', {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return undefined;
    const metadata = await response.json() as { webSocketDebuggerUrl?: unknown };
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
  private connection?: 'existing-chrome' | 'persistent-profile';

  get currentPage(): Page | undefined { return this.page; }

  get kind(): 'existing-chrome' | 'persistent-profile' | undefined {
    return this.connection;
  }

  async open(platform: string, accountId?: string): Promise<Page> {
    if (accountId && !/^[0-9a-fA-F-]{36}$/.test(accountId)) throw new Error('Invalid connector account ID');
    if (this.page) throw new Error('Browser session is already in use');
    // Connected accounts must never share the user's global Chrome/CDP cookies.
    const cdpUrl = process.env.UTOMATOR_DISABLE_CDP === 'true' || accountId
      ? undefined : process.env.CHROME_CDP_URL?.trim() || await discoverRunningChrome();
    if (cdpUrl) {
      const cdp = new URL(cdpUrl);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(cdp.hostname) ||
          !['http:', 'https:'].includes(cdp.protocol)) throw new Error('CDP must use loopback');
      try {
        this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 6000 });
      } catch {
        throw new Error('Cannot attach to Chrome debugging session. Verify Chrome is running with a loopback CDP port, or disable CHROME_CDP_URL to use the persistent profile.');
      }
      this.context = this.browser.contexts()[0];
      if (!this.context) throw new Error('CDP browser has no context');
      // Use our own tab. Never overwrite an unrelated Chrome tab.
      this.page = await this.context.newPage();
      this.connection = 'existing-chrome';
    } else {
      const dir = accountId ? resolve('.runtime', 'chrome', 'accounts', accountId) : resolve('.runtime', 'chrome', platform);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      this.context = await chromium.launchPersistentContext(dir, {
        // Hosted workers use their own Playwright-managed Chromium, never a system Chrome profile.
        ...(process.env.UTOMATOR_DISABLE_CDP === 'true' ? {} : {channel:'chrome'}),
        headless: process.env.HEADLESS === 'true',
        viewport: { width: 1366, height: 850 }, acceptDownloads: false,
      });
      this.page = this.context.pages()[0] ?? await this.context.newPage();
      this.connection = 'persistent-profile';
    }
    this.page.setDefaultTimeout(12000);
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.browser) await this.page?.close();
      else await this.context?.close();
    } finally {
      // For CDP: disconnect from Chrome, do not terminate the user's browser.
      if (this.browser) await this.browser.close();
      this.page = undefined; this.context = undefined; this.browser = undefined;
      this.connection = undefined;
    }
  }
}
