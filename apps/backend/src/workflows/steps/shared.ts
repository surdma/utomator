import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Locator, Page } from 'playwright';
import { attemptLogin } from '../../browser/login.js';
import { AuthBlockedError } from '../../core/errors.js';
import { runtimePath } from '../../core/paths.js';
import type { RunRequest, StreamEvent } from '../../core/types.js';

export interface WorkflowContext {
  page: Page;
  input: RunRequest;
  profile: URL;
  runId: string;
  signal: AbortSignal;
  emit: (kind: StreamEvent['kind'], message: string, details?: unknown) => void;
  approve: (message: string) => Promise<void>;
  ask: (message: string) => Promise<string>;
}

export function assertActive(ctx: WorkflowContext): void {
  if (ctx.signal.aborted) throw new Error('Run cancelled');
}

const AUTH_ROUTE =
  /\/(?:authwall|login|uas\/login|checkpoint|challenge|i\/flow\/login|security|signup)(?:\/|$)/i;
const LOGIN_POLL_MS = 120;
const LOGIN_OBSERVATION_MS = 2160;

function officialUrl(platform: RunRequest['platform'], url: string): URL {
  const current = new URL(url);
  const allowed =
    platform === 'linkedin' ? ['linkedin.com', 'www.linkedin.com'] : ['x.com', 'www.x.com'];
  if (current.protocol !== 'https:' || !allowed.includes(current.hostname)) {
    throw new Error('Browser navigation left the expected platform');
  }
  return current;
}

async function loginScreen(page: Page, platform: RunRequest['platform']): Promise<boolean> {
  const current = officialUrl(platform, page.url());
  if (AUTH_ROUTE.test(current.pathname)) return true;
  return page
    .locator('input[type="password"], input[name="session_key"]')
    .first()
    .isVisible()
    .catch(() => false);
}

async function waitForLoginRedirect(ctx: WorkflowContext): Promise<boolean> {
  for (let elapsed = 0; elapsed <= LOGIN_OBSERVATION_MS; elapsed += LOGIN_POLL_MS) {
    assertActive(ctx);
    if (await loginScreen(ctx.page, ctx.input.platform)) return true;
    if (elapsed < LOGIN_OBSERVATION_MS) await ctx.page.waitForTimeout(LOGIN_POLL_MS);
  }
  return false;
}

export async function navigate(ctx: WorkflowContext, url: string): Promise<void> {
  assertActive(ctx);
  const target = officialUrl(ctx.input.platform, url);
  ctx.emit('step', 'Navigating to ' + target.pathname);
  await ctx.page.goto(target.href, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  let autoAttempted = false;
  for (let promptNumber = 0; promptNumber <= 2; promptNumber++) {
    if (!(await waitForLoginRedirect(ctx))) {
      officialUrl(ctx.input.platform, ctx.page.url());
      return;
    }
    if (ctx.input.accountId) {
      throw new Error(
        'Not authenticated: connected account session expired. Reconnect and sync this account before retrying.',
      );
    }
    if (!autoAttempted && ctx.input.login) {
      autoAttempted = true;
      const credentials = ctx.input.login;
      ctx.emit('step', 'Checking the official login form using one-time credentials');
      try {
        const submitted = await attemptLogin(ctx.page, ctx.input.platform, credentials, ctx.signal);
        if (submitted) {
          await ctx.page
            .waitForURL((next) => !AUTH_ROUTE.test(next.pathname), {
              timeout: 10000,
            })
            .catch(() => {});
          await ctx.page.goto(target.href, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          continue;
        }
      } catch {
        ctx.emit('step', 'Automatic login unavailable; sign in manually in Chrome');
      } finally {
        credentials.password = '';
        ctx.input.login = undefined;
      }
    }
    if (promptNumber === 2) {
      throw new Error('Not authenticated; complete sign-in or security verification before retrying');
    }
    ctx.emit('step', 'Sign-in required: Chrome stays open during manual login');
    await ctx.approve(
      'Sign in to the official account in Chrome (including MFA), then approve to retry the profile. Reject or cancel to close the session.',
    );
    assertActive(ctx);
    await ctx.page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  }
}

export async function image(ctx: WorkflowContext, label: string): Promise<string> {
  const dir = runtimePath('evidence', ctx.runId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const name = `${label.replace(/[^a-z0-9-]/gi, '_')}.png`;
  const output = resolve(dir, name);
  await ctx.page.screenshot({ path: output, fullPage: false, timeout: 10000 });
  await chmod(output, 0o600);
  ctx.emit('screenshot', `Captured ${label.replace(/-/g, ' ')}`, {
    fileName: name,
  });
  const snapshotName = name.replace(/\.png$/, '.yml');
  try {
    const tree = await ctx.page.locator('body').ariaSnapshot({ timeout: 10000 });
    await writeFile(resolve(dir, snapshotName), tree, { mode: 0o600 });
    ctx.emit('step', `Accessibility snapshot stored: ${snapshotName}`);
  } catch (error) {
    ctx.emit('error', `Screenshot saved but accessibility tree unavailable: ${String(error)}`);
  }
  return name;
}

export async function one(locator: Locator, label: string): Promise<Locator> {
  const n = await locator.count();
  if (n !== 1 || !(await locator.isVisible()))
    throw new Error(`Expected one visible ${label}; found ${n}`);
  return locator;
}

export async function save(ctx: WorkflowContext): Promise<void> {
  assertActive(ctx);
  const visibleButtons = ctx.page.getByRole('button', {
    name: 'Save',
    exact: true,
  });
  const count = await visibleButtons.count();
  const dialog = ctx.page.getByRole('dialog').last();
  const button = (await dialog.isVisible().catch(() => false))
    ? dialog.getByRole('button', { name: 'Save', exact: true })
    : visibleButtons;
  if (count === 0) throw new Error('Save button not visible');
  assertActive(ctx);
  await (await one(button, 'Save button')).click();
  ctx.emit('step', 'Save clicked; checking the persisted result');
}

export async function ensureLinkedInOwner(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  let affordance = ctx.page.getByRole('button', { name: /edit intro/i });
  if ((await affordance.count()) === 0)
    affordance = ctx.page.locator('button[aria-label*="Edit intro"]');
  if ((await affordance.count()) === 0) {
    if (ctx.input.accountId) {
      throw new AuthBlockedError(
        'Not authenticated: connected account ownership could not be verified. Reconnect and sync this account.',
      );
    }
    await ctx.approve(
      'Open the correct signed-in LinkedIn account, confirm it is your profile, then continue',
    );
    await navigate(ctx, ctx.profile.href);
    if ((await affordance.count()) === 0)
      throw new AuthBlockedError('Cannot establish edit ownership of LinkedIn profile');
  }
}

export async function ensureXOwner(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  const btn = ctx.page.locator('[data-testid="editProfileButton"]');
  if ((await btn.count()) === 0) {
    await ctx.approve('Sign into the X account that owns this profile, then approve');
    await navigate(ctx, ctx.profile.href);
  }
  await one(btn, 'Edit profile button');
}

/**
 * Retry only side-effect-free reads that lost their JS execution context during
 * a provider redirect/hydration navigation. Never wrap Save/Post/Delete here.
 */
export async function observeAfterNavigation<T>(
  page: Pick<Page, 'waitForLoadState' | 'url'>,
  expectedUrl: URL,
  read: () => Promise<T>,
  options: { signal?: AbortSignal; onRetry?: (attempt: number) => void } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) throw new Error('Run cancelled');
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 12000 });
      const result = await read();
      const observed = new URL(page.url());
      const actualPath = observed.pathname.replace(/\/$/, '');
      const expectedPath = expectedUrl.pathname.replace(/\/$/, '');
      const permittedHosts = expectedUrl.hostname.endsWith('linkedin.com')
        ? ['linkedin.com', 'www.linkedin.com']
        : ['x.com', 'www.x.com'];
      if (
        observed.protocol !== 'https:' ||
        !permittedHosts.includes(observed.hostname) ||
        actualPath !== expectedPath
      ) {
        throw new Error(
          'Profile navigation changed to a different page during audit; recheck sign-in and the requested profile',
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/execution context was destroyed|cannot find context with specified id|navigation.*interrupted/i.test(
          message,
        ) ||
        attempt === 2
      ) {
        throw error;
      }
      if (options.signal?.aborted) throw new Error('Run cancelled');
      options.onRetry?.(attempt + 1);
      await page.waitForLoadState('domcontentloaded', { timeout: 12000 });
    }
  }
  throw new Error('Profile observation could not stabilize');
}
