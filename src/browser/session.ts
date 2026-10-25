import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Platform } from '../core/types.js';

export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  async open(platform: Platform): Promise<Page> {
    if (this.page) throw new Error('Browser session is already in use');
    const cdpUrl = process.env.CHROME_CDP_URL;
    if (cdpUrl) {
      const cdp = new URL(cdpUrl);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(cdp.hostname) ||
          !['http:', 'https:'].includes(cdp.protocol)) throw new Error('CDP must use loopback');
      this.browser = await chromium.connectOverCDP(cdpUrl);
      this.context = this.browser.contexts()[0];
      if (!this.context) throw new Error('CDP browser has no context');
      // Use our own tab. Never overwrite an unrelated Chrome tab.
      this.page = await this.context.newPage();
    } else {
      const dir = resolve('.runtime', 'chrome', platform);
      await mkdir(dir, { recursive: true });
      this.context = await chromium.launchPersistentContext(dir, {
        channel: 'chrome', headless: process.env.HEADLESS === 'true',
        viewport: { width: 1366, height: 850 }, acceptDownloads: false,
      });
      this.page = this.context.pages()[0] ?? await this.context.newPage();
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
    }
  }
}
