import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { BrowserSession } from '../src/infrastructure/browser/session.js';
import { removeTemp } from './support/remove-temp.js';

test('CDP reuse shares login cookies without closing existing Chrome tabs', {
  timeout: 45000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'utomator-cdp-'));
  const previous = process.env.CHROME_CDP_URL;
  const previousMode = process.env.UTOMATOR_BROWSER_MODE;
  const previousHeadless = process.env.HEADLESS;
  const previousOwner = process.env.UTOMATOR_INTERNAL_OWNER_ID;
  process.env.UTOMATOR_BROWSER_MODE = 'attached';
  process.env.HEADLESS = 'false';
  delete process.env.UTOMATOR_INTERNAL_OWNER_ID;
  let chrome: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    chrome = await chromium.launchPersistentContext(directory, {
      headless: true,
      args: ['--remote-debugging-port=0'],
    });
    // The DevTools port may appear after Playwright reports a ready context.
    // Avoid a filesystem race without weakening the connection assertions.
    let port = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const portFile = await readFile(join(directory, 'DevToolsActivePort'), 'utf8');
        port = Number(portFile.split(/\r?\n/)[0]);
        if (Number.isInteger(port) && port > 0) break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    expect(Number.isInteger(port) && port > 0).toBeTruthy();

    const originalTab = chrome.pages()[0] ?? (await chrome.newPage());
    await originalTab.goto('about:blank');
    await chrome.addCookies([
      {
        name: 'utomator_fixture',
        value: 'signed_in',
        url: 'https://www.linkedin.com',
      },
    ]);
    process.env.CHROME_CDP_URL = `http://127.0.0.1:${port}`;
    for (let run = 0; run < 2; run++) {
      const session = new BrowserSession();
      try {
        const newTab = await session.open('linkedin');
        expect(session.kind).toEqual('existing-chrome');
        expect(newTab).not.toEqual(originalTab);
        const cookies = await newTab.context().cookies('https://www.linkedin.com');
        expect(cookies.find((item) => item.name === 'utomator_fixture')?.value).toEqual('signed_in');
        expect(originalTab.isClosed()).toEqual(false);
      } finally {
        await session.close();
      }
      expect(originalTab.isClosed()).toEqual(false);
      expect(await originalTab.evaluate(() => 2 + 2)).toEqual(4);
    }
  } finally {
    if (previous === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previous;
    if (previousMode === undefined) delete process.env.UTOMATOR_BROWSER_MODE;
    else process.env.UTOMATOR_BROWSER_MODE = previousMode;
    if (previousHeadless === undefined) delete process.env.HEADLESS;
    else process.env.HEADLESS = previousHeadless;
    if (previousOwner === undefined) delete process.env.UTOMATOR_INTERNAL_OWNER_ID;
    else process.env.UTOMATOR_INTERNAL_OWNER_ID = previousOwner;
    await chrome?.close();
    await removeTemp(directory);
  }
});

test('CDP attachment rejects non-loopback endpoints before connecting', async () => {
  const previous = process.env.CHROME_CDP_URL;
  const previousMode = process.env.UTOMATOR_BROWSER_MODE;
  const previousHeadless = process.env.HEADLESS;
  const previousOwner = process.env.UTOMATOR_INTERNAL_OWNER_ID;
  process.env.UTOMATOR_BROWSER_MODE = 'attached';
  process.env.HEADLESS = 'false';
  delete process.env.UTOMATOR_INTERNAL_OWNER_ID;
  process.env.CHROME_CDP_URL = 'http://192.0.2.1:9222';
  const session = new BrowserSession();
  try {
    await expect(() => session.open('x')).rejects.toThrow(/CDP must use loopback/);
  } finally {
    if (previous === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previous;
    if (previousMode === undefined) delete process.env.UTOMATOR_BROWSER_MODE;
    else process.env.UTOMATOR_BROWSER_MODE = previousMode;
    if (previousHeadless === undefined) delete process.env.HEADLESS;
    else process.env.HEADLESS = previousHeadless;
    if (previousOwner === undefined) delete process.env.UTOMATOR_INTERNAL_OWNER_ID;
    else process.env.UTOMATOR_INTERNAL_OWNER_ID = previousOwner;
    await session.close();
  }
});
