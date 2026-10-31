import type { Page } from 'playwright';
import type { Platform, LoginCredentials } from '../core/types.js';

// Credentials exist only for the active request. Never capture login screens in evidence.
export async function attemptLogin(
  page: Page,
  platform: Platform,
  credentials: LoginCredentials,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) throw new Error('Run cancelled');
  const current = new URL(page.url());
  const hosts = platform === 'linkedin' ? ['linkedin.com', 'www.linkedin.com'] : ['x.com', 'www.x.com'];
  if (current.protocol !== 'https:' || !hosts.includes(current.hostname)) {
    throw new Error('Login form is not on the official platform');
  }
  if (platform === 'linkedin') {
    if (!current.pathname.includes('login')) return false;
    const identifier = page.locator('input#username, input[name="session_key"]');
    const password = page.locator('input#password, input[name="session_password"]');
    if ((await identifier.count()) !== 1 || (await password.count()) !== 1) return false;
    await identifier.fill(credentials.identifier);
    await password.fill(credentials.password);
    const submit = page.getByRole('button', { name: /^sign in$/i });
    if ((await submit.count()) !== 1) return false;
    if (signal.aborted) throw new Error('Run cancelled');
    await submit.click();
    return true;
  }

  if (!current.pathname.startsWith('/i/flow/login')) return false;
  let password = page.locator('input[type="password"]');
  if ((await password.count()) === 0 || !(await password.first().isVisible())) {
    const identifier = page.locator('input[autocomplete="username"], input[name="text"]');
    if ((await identifier.count()) !== 1) return false;
    await identifier.fill(credentials.identifier);
    const next = page.getByRole('button', { name: /^next$/i });
    if ((await next.count()) !== 1) return false;
    if (signal.aborted) throw new Error('Run cancelled');
    await next.click();
    password = page.locator('input[type="password"]');
    try {
      await password.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return false;
    } // additional verification or an unfamiliar login form
  }
  if ((await password.count()) !== 1) return false;
  await password.fill(credentials.password);
  const login = page.getByRole('button', { name: /^log in$/i });
  if ((await login.count()) !== 1) return false;
  if (signal.aborted) throw new Error('Run cancelled');
  await login.click();
  return true;
}
