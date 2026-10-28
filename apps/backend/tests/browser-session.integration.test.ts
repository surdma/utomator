import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { BrowserSession } from '../src/browser/session.js';

test('CDP reuse shares login cookies without closing existing Chrome tabs', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'utomator-cdp-'));
  const previous = process.env.CHROME_CDP_URL;
  let chrome: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    chrome = await chromium.launchPersistentContext(directory, {
      headless: true, args: ['--remote-debugging-port=0'],
    });
    const portFile = await readFile(join(directory, 'DevToolsActivePort'), 'utf8');
    const port = Number(portFile.split(/\r?\n/)[0]);
    assert(Number.isInteger(port) && port > 0, 'Chrome must expose its debugging port');

    const originalTab = chrome.pages()[0] ?? await chrome.newPage();
    await originalTab.goto('about:blank');
    await chrome.addCookies([{
      name: 'utomator_fixture', value: 'signed_in', url: 'https://www.linkedin.com',
    }]);
    process.env.CHROME_CDP_URL = 'http://127.0.0.1:' + port;
    for (let run = 0; run < 2; run++) {
      const session = new BrowserSession();
      try {
        const newTab = await session.open('linkedin');
        assert.equal(session.kind, 'existing-chrome');
        assert.notEqual(newTab, originalTab);
        const cookies = await newTab.context().cookies('https://www.linkedin.com');
        assert.equal(cookies.find(item => item.name === 'utomator_fixture')?.value, 'signed_in');
        assert.equal(originalTab.isClosed(), false);
      } finally {
        await session.close();
      }
      assert.equal(originalTab.isClosed(), false, 'ending an Utomator run must preserve existing tabs');
      assert.equal(await originalTab.evaluate(() => 2 + 2), 4,
        'the original browser must still be controllable after disconnect');
    }
  } finally {
    if (previous === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previous;
    await chrome?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('CDP attachment rejects non-loopback endpoints before connecting', async () => {
  const previous = process.env.CHROME_CDP_URL;
  process.env.CHROME_CDP_URL = 'http://192.0.2.1:9222';
  const session = new BrowserSession();
  try {
    await assert.rejects(() => session.open('x'), /CDP must use loopback/);
  } finally {
    if (previous === undefined) delete process.env.CHROME_CDP_URL;
    else process.env.CHROME_CDP_URL = previous;
    await session.close();
  }
});
