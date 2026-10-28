import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log("  PASS: " + name);
      passed++;
    } else {
      console.log("  FAIL: " + name);
      failed++;
    }
  }

  try {
    console.log("\nTest 1: Connector onboarding dialog");
    await page.goto(BASE + "/dashboard/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const floatBtn = page.locator("[data-testid='floating-connector-button']");
    assert(await floatBtn.isVisible(), "Floating connector button visible");

    await floatBtn.click();
    await page.waitForTimeout(2000);

    const dialog = page.locator("[data-testid='connector-onboarding-dialog']");
    // Try clicking again if dialog didn't open
    if (!(await dialog.isVisible())) {
      await floatBtn.click();
      await page.waitForTimeout(2000);
    }
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    assert(await dialog.isVisible(), "Dialog is visible");

    const accountBtns = dialog.locator("button:has-text('@surdma')");
    const count = await accountBtns.count();
    assert(count > 0, "LinkedIn account @surdma visible in dialog");

    if (count > 0) {
      await accountBtns.first().click();

      const syncBtn = dialog.locator("button:has-text('Sync')");
      assert(await syncBtn.count() > 0, "Sync button visible");

      const disconnectBtn = dialog.locator("button:has-text('Disconnect')");
      assert(await disconnectBtn.count() > 0, "Disconnect button visible");
    }

    await page.keyboard.press("Escape");
    assert(!(await dialog.isVisible()), "Dialog closes on Escape");

    console.log("\nTest 2: Sync button calls API");
    const syncUrls = [];
    page.on("request", (request) => {
      if (request.url().includes("/connectors/") && request.method() === "POST") {
        syncUrls.push(request.url());
      }
    });

    await floatBtn.click();
    await dialog.waitFor({ state: "visible", timeout: 5000 });

    if ((await accountBtns.count()) > 0) {
      await accountBtns.first().click();

      const syncBtn = dialog.locator("button:has-text('Sync')");
      if ((await syncBtn.count()) > 0) {
        await syncBtn.click();
        await page.waitForTimeout(3000);
        assert(syncUrls.length > 0, "Sync API was called (" + syncUrls.length + " requests)");
      }
    }

    await page.keyboard.press("Escape");

    console.log("\nTest 3: Server-managed session survives reload");
    await page.goto(BASE + "/dashboard/profile/connections", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    const heading = page.locator("text=Social profile directory");
    assert(await heading.isVisible(), "Connections page loads");

    const linkedinText = page.locator("text=LinkedIn");
    assert(await linkedinText.isVisible(), "LinkedIn accounts visible from server");

    await page.reload();
    await page.waitForTimeout(2000);
    assert(await heading.isVisible(), "Connections page survives reload");
    assert(await linkedinText.isVisible(), "LinkedIn accounts still visible after reload");

  } catch (error) {
    console.log("  ERROR: " + error.message);
    failed++;
  }

  await browser.close();

  console.log("\nResults: " + passed + " passed, " + failed + " failed");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});