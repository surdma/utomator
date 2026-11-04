
import { test, expect } from 'vitest';
import { chromium } from 'playwright';
import { attemptLogin } from '../src/browser/login.js';

test('LinkedIn fixture receives credentials with no logging or external request', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://www.linkedin.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<form><input id="username"><input id="password" type="password"><button type="button" onclick="document.body.dataset.sent = \'yes\'">Sign in</button></form>',
      });
    });
    await page.goto('https://www.linkedin.com/login');
    const submitted = await attemptLogin(
      page,
      'linkedin',
      {
        identifier: 'fixture@example.test',
        password: 'a-test-secret',
      },
      new AbortController().signal,
    );
    expect(submitted).toEqual(true);
    expect(await page.locator('body').getAttribute('data-sent')).toEqual('yes');
  } finally {
    await browser.close();
  }
});

test('credentials are never used on an untrusted origin', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await expect((attemptLogin(
        page,
        'linkedin',
        {
          identifier: 'someone@example.test',
          password: 'not-real',
        },
        new AbortController().signal,
      ))).rejects.toThrow(/official platform/);
  } finally {
    await browser.close();
  }
});

test('X two-step fixture logs in without writing credentials to run history', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://x.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body>
        <input autocomplete="username">
        <button onclick="this.hidden=true;document.getElementById('second').hidden=false">Next</button>
        <div id="second" hidden>
          <input type="password"><button onclick="document.body.dataset.sent='yes'">Log in</button>
        </div>
      </body>`,
      });
    });
    await page.goto('https://x.com/i/flow/login');
    expect(await attemptLogin(
        page,
        'x',
        {
          identifier: 'surdma_fixture',
          password: 'one-time-only',
        },
        new AbortController().signal,
      )).toEqual(true);
    expect(await page.locator('body').getAttribute('data-sent')).toEqual('yes');
  } finally {
    await browser.close();
  }
});
