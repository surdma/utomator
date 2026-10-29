import type { BrowserContext, Page } from 'playwright';
import type { VaultPayload } from '../core/session-vault.js';

/**
 * Vault restore helpers: session-state classification, snapshot capture and
 * origin-storage seeding. All pure functions over Playwright primitives so the
 * hosted runner and the sign-in broker share one set of LinkedIn/X signals.
 */

/** Hosts and URL patterns that unambiguously mean "signed in" vs "bounced out". */
const authWalledPath = /\/(login|authwall|checkpoint|uas)(?:\/|\?|$)/;

export function classifyProviderAuth(
  url: string,
  platform: 'linkedin' | 'x'
): 'authenticated' | 'auth-walled' {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'auth-walled';
  }
  if (parsed.protocol !== 'https:') return 'auth-walled';
  const host = parsed.hostname;
  if (platform === 'linkedin') {
    if (host.endsWith('linkedin.com') && host.startsWith('authwall'))
      return 'auth-walled';
    if (!['linkedin.com', 'www.linkedin.com'].includes(host))
      return 'auth-walled';
    if (authWalledPath.test(parsed.pathname)) return 'auth-walled';
    // The authenticated homepage and owned profiles share the session's cookies;
    // anything reachable only behind login is not a restored surface.
    return parsed.pathname.startsWith('/feed') ||
      parsed.pathname === '/' ||
      /^\/in\//.test(parsed.pathname)
      ? 'authenticated'
      : 'auth-walled';
  }
  if (!['x.com', 'www.x.com'].includes(host)) return 'auth-walled';
  return authWalledPath.test(parsed.pathname) ? 'auth-walled' : 'authenticated';
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Map a Playwright storageState into the vault payload shape (cookies + origins). */
export function toVaultOriginState(
  state: StorageState
): VaultPayload['originState'] {
  return state.origins.map((origin) => ({
    origin: origin.origin,
    localStorage: origin.localStorage.map((item) => ({
      name: item.name,
      value: item.value,
    })),
  }));
}

/** Capture the freshest browser session state; browser hints come from launch options. */
export async function captureSessionSnapshot(
  context: BrowserContext,
  platform: 'linkedin' | 'x'
): Promise<{
  platform: 'linkedin' | 'x';
  capturedAt: string;
  cookies: StorageState['cookies'];
  originState: VaultPayload['originState'];
}> {
  const state = await context.storageState();
  return {
    platform,
    capturedAt: new Date().toISOString(),
    cookies: state.cookies,
    originState: toVaultOriginState(state),
  };
}

/**
 * Replay saved origin storage into a restored context. sessionStorage cannot be
 * carried by storageState, so replay covers localStorage per origin. HF pages
 * still authenticate through cookies; this restores UI state the session relied on.
 */
export async function seedOriginStorage(
  page: Page,
  entries: VaultPayload['originState']
): Promise<void> {
  for (const entry of entries) {
    let target: URL;
    try {
      target = new URL('/', entry.origin);
    } catch {
      continue;
    }
    if (target.protocol !== 'https:') continue;
    await page.goto(target.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.evaluate(
      (stores) => {
        for (const [name, value] of stores)
          window.localStorage.setItem(name, value);
      },
      entry.localStorage.map(
        (item) => [item.name, item.value] as [string, string]
      )
    );
  }
}
