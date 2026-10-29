import axe from "axe-core";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { connectorAccount, installConnectorApi, iso, openConnectorDialog } from "./support/connector-mocks";

const mobileBrowser = (page: Page) =>
  page.evaluate(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

async function capture(page: Page, info: TestInfo, label: string) {
  await info.attach(label + ".png", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
}

async function assertLayout(page: Page) {
  const problems = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="connector-onboarding-dialog"]');
    if (!dialog) return ["Connection dialog missing"];
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      issues.push("Document overflows the viewport horizontally");
    if (dialog.scrollWidth > dialog.clientWidth + 1)
      issues.push("Dialog content overflows horizontally");
    for (const button of dialog.querySelectorAll<HTMLButtonElement>("button")) {
      const bounds = button.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const name = button.getAttribute("aria-label") || button.textContent?.trim() || "unlabelled button";
      if (bounds.width < 43.5 || bounds.height < 43.5)
        issues.push(name + " has a touch target smaller than 44x44px");
      if (bounds.left < -1 || bounds.right > window.innerWidth + 1)
        issues.push(name + " lies outside the viewport horizontally");
    }
    return issues;
  });
  expect(problems, problems.join("\n")).toEqual([]);
}

async function assertAxe(page: Page, info: TestInfo, label: string) {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const audit = (window as Window & { axe: typeof axe }).axe;
    const dialog = document.querySelector('[data-testid="connector-onboarding-dialog"]');
    if (!dialog) throw new Error("Missing connector dialog");
    return audit.run(dialog, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
  });
  await info.attach("accessibility-" + label + ".json", {
    body: Buffer.from(JSON.stringify({
      violations: result.violations,
      passes: result.passes.map(item => item.id),
      incomplete: result.incomplete.map(item => item.id),
    }, null, 2)),
    contentType: "application/json",
  });
  const failures = result.violations.map(item =>
    item.id + " (" + item.impact + "): " + item.nodes.map(node => node.target.join(" ")).join(", "));
  expect(failures, failures.join("\n")).toEqual([]);
}

test("provider choices, connection CTA, and the full dialog fit the active viewport", async ({ page }, info) => {
  await installConnectorApi(page, []);
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByRole("button", { name: "LinkedIn", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Connect LinkedIn", exact: true })).toBeVisible();
  await assertLayout(page);
  await capture(page, info, "linkedin-unlinked");

  await dialog.getByRole("button", { name: "Instagram" }).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Unavailable");
  await expect(dialog.getByText(/Official API connector not available yet/)).toBeVisible();
  await assertLayout(page);
  await capture(page, info, "provider-unavailable");

  await dialog.getByRole("button", { name: "LinkedIn", exact: true }).click();
  const connect = dialog.getByRole("button", { name: "Connect LinkedIn", exact: true });
  await connect.scrollIntoViewIfNeeded();
  if (await mobileBrowser(page)) {
    await expect(connect).toBeDisabled();
    await expect(dialog.getByText(/Mobile Chrome and Safari cannot share/)).toBeVisible();
  } else {
    await expect(connect).toBeEnabled();
  }
});

test("connected accounts remain legible, usable and unclipped", async ({ page }, info) => {
  await installConnectorApi(page, [
    connectorAccount("linkedin", {
      id: "visual-linked",
      label: "A long professional profile display name for small viewport layout coverage",
      handle: "an-unusually-long-professional-profile-handle",
      status: "connected",
      verifiedAt: iso.now(),
    }),
  ]);
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
  const name = dialog.getByText(/long professional profile display name/);
  const handle = dialog.getByText("@an-unusually-long-professional-profile-handle");
  await expect(name).toBeVisible();
  await expect(handle).toBeVisible();
  // A hidden CSS ellipsis is not readable on compact screens.
  expect(await name.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await handle.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await assertLayout(page);
  await capture(page, info, "linkedin-connected");
  await expect(dialog.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Confirm disconnect" })).toBeVisible();
  await assertLayout(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
});

test("WCAG A and AA checks cover unlinked, unavailable, and connected provider states", async ({ page }, info) => {
  await installConnectorApi(page, [
    connectorAccount("linkedin", { id: "a11y-connected", status: "connected", verifiedAt: iso.now() }),
  ]);
  const dialog = await openConnectorDialog(page);
  await assertAxe(page, info, "connected");
  await dialog.getByRole("button", { name: "GitHub" }).click();
  await assertAxe(page, info, "unavailable");
  await dialog.getByRole("button", { name: "X", exact: true }).click();
  await assertAxe(page, info, "unlinked");
});

test("network errors are shown as recoverable feedback", async ({ page }, info) => {
  await installConnectorApi(page, [], event =>
    event.method === "GET" ? { status: 503 } : undefined);
  const dialog = await openConnectorDialog(page);
  await expect(dialog.getByRole("alert")).toContainText("Social connections unavailable");
  await assertLayout(page);
  await capture(page, info, "network-error");
  await expect(dialog.getByRole("button", { name: "LinkedIn", exact: true })).toBeEnabled();
});

test("native dialog traps keyboard focus and closes on Escape", async ({ page }) => {
  await installConnectorApi(page, []);
  const dialog = await openConnectorDialog(page);
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const focusInside = await dialog.evaluate(element => element.contains(document.activeElement));
    expect(focusInside, "Tab focus must remain within the open modal").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
