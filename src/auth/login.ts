import type { Page, Locator } from 'playwright';
import type { RunRequest } from '../core/types.js';

/** No password is logged, persisted, captured, or included in an error message. */
export async function loginIfRequired(
  page: Page,
  input: RunRequest,
  profile: URL,
  approve: (message: string) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const credentials = input.credentials;
  if (!credentials) return; // Existing manual-login/checkpoint behavior is unchanged.
  const origin = input.platform === 'linkedin' ? 'https://www.linkedin.com' : 'https://x.com';
  assertActive(signal);
  await page.goto(profile.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const current = new URL(page.url());
  assertPlatform(current, input.platform);
  const loggedOut = /\/(login|checkpoint|challenge|i\/flow\/login)(?:\/|$)/i.test(current.pathname) ||
    await page.getByRole('link', { name: /^(sign in|log in)$/i }).first().isVisible().catch(() => false);
  if (!loggedOut) return;
  assertActive(signal);
  if (input.platform === 'linkedin') {
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    assertPlatform(new URL(page.url()), input.platform);
    const user = page.locator('#username');
    const pass = page.locator('#password');
    await oneVisible(user, 'LinkedIn sign-in field');
    await oneVisible(pass, 'LinkedIn password field');
    await user.fill(credentials.loginId);
    await pass.fill(credentials.password);
    assertActive(signal);
    await page.locator('button[type="submit"]').first().click();
  } else {
    await page.goto(`${origin}/i/flow/login`, { waitUntil: 'domcontentloaded' });
    assertPlatform(new URL(page.url()), input.platform);
    const user = page.locator('input[autocomplete="username"],input[name="text"]');
    await oneVisible(user, 'X sign-in field');
    await user.fill(credentials.loginId);
    assertActive(signal);
    await page.getByRole('button', { name: /^next$/i }).click();
    assertPlatform(new URL(page.url()), input.platform);
    const pass = page.locator('input[name="password"],input[type="password"]');
    // X sometimes requires a separate account-identifier confirmation.
    if (!await pass.first().isVisible({ timeout: 8000 }).catch(() => false)) {
      await approve('X requires another identity or security step. Complete it in Chrome, then approve to continue.');
    }
    await oneVisible(pass, 'X password field');
    assertPlatform(new URL(page.url()), input.platform);
    await pass.fill(credentials.password);
    assertActive(signal);
    await page.getByRole('button', { name: /^log in$/i }).click();
  }
  assertActive(signal);
  // Never bypass, automate, or try to read an MFA/verification challenge.
  const after = new URL(page.url());
  assertPlatform(after, input.platform);
  if (/\/(checkpoint|challenge|i\/flow\/login|login)(?:\/|$)/i.test(after.pathname)) {
    await approve('Complete any login challenge in Chrome manually, then approve to continue.');
  }
  assertActive(signal);
  await page.goto(profile.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const resolved = new URL(page.url());
  assertPlatform(resolved, input.platform);
  if (/\/(login|checkpoint|challenge|i\/flow\/login)(?:\/|$)/i.test(resolved.pathname)) {
    throw new Error('Account not authenticated; finish sign-in manually');
  }
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Run cancelled');
}
function assertPlatform(url: URL, platform: RunRequest['platform']): void {
  const allowed = platform === 'linkedin' ? ['linkedin.com', 'www.linkedin.com'] : ['x.com', 'www.x.com'];
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname)) throw new Error('Sign-in was redirected outside the official platform');
}
async function oneVisible(locator: Locator, label: string): Promise<void> {
  const count = await locator.count();
  if (count !== 1 || !await locator.isVisible()) throw new Error(`${label} is unavailable; sign in manually in Chrome`);
}
