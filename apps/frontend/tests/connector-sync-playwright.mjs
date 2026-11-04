import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function expect(condition).toBeTruthy() {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  try {
    console.log('\nTest 1: Connector onboarding dialog');
    await page.goto(`${BASE}/dashboard/pipeline`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    const floatBtn = page.locator("[data-testid='floating-connector-button']");
    expect(await floatBtn.isVisible()).toBeTruthy();

    await floatBtn.click();
    await page.waitForTimeout(2000);

    const dialog = page.locator("[data-testid='connector-onboarding-dialog']");
    // Try clicking again if dialog didn't open
    if (!(await dialog.isVisible())) {
      await floatBtn.click();
      await page.waitForTimeout(2000);
    }
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    expect(await dialog.isVisible()).toBeTruthy();

    const accountBtns = dialog.locator("button:has-text('@surdma')");
    const count = await accountBtns.count();
    expect(count > 0).toBeTruthy();

    if (count > 0) {
      await accountBtns.first().click();

      const syncBtn = dialog.locator("button:has-text('Sync')");
      expect((await syncBtn.count()) > 0).toBeTruthy();

      const disconnectBtn = dialog.locator("button:has-text('Disconnect')");
      expect((await disconnectBtn.count()) > 0).toBeTruthy();
    }

    await page.keyboard.press('Escape');
    expect(!(await dialog.isVisible())).toBeTruthy();

    console.log('\nTest 2: Sync button calls API');
    const syncUrls = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/connectors/') &&
        request.method() === 'POST'
      ) {
        syncUrls.push(request.url());
      }
    });

    await floatBtn.click();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    if ((await accountBtns.count()) > 0) {
      await accountBtns.first().click();

      const syncBtn = dialog.locator("button:has-text('Sync')");
      if ((await syncBtn.count()) > 0) {
        await syncBtn.click();
        await page.waitForTimeout(3000);
        expect(syncUrls.length > 0).toBeTruthy();
      }
    }

    await page.keyboard.press('Escape');

    console.log('\nTest 3: Server-managed session survives reload');
    await page.goto(`${BASE}/dashboard/profile/connections`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);

    const heading = page.locator('text=Social profile directory');
    expect(await heading.isVisible()).toBeTruthy();

    const linkedinText = page.locator('text=LinkedIn');
    expect(await linkedinText.isVisible()).toBeTruthy();

    await page.reload();
    await page.waitForTimeout(2000);
    expect(await heading.isVisible()).toBeTruthy();
    expect(await linkedinText.isVisible()).toBeTruthy();
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
    failed++;
  }

  await browser.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
