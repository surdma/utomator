import { mkdir, rm } from 'node:fs/promises';
import { type Browser, type BrowserContext, type CDPSession, chromium, type Page } from 'playwright';
import { runtimePath } from '../core/paths.js';

/**
 * Centralized browser provider.
 *
 * This module owns every way the engine obtains a browser: the single
 * launch-policy function, the scratch-profile lifecycle, the loopback CDP
 * attach transport, and the shared screencast plumbing. It is the ONLY file in
 * the backend allowed to import Playwright's `chromium`.
 *
 * It is a factory, not a singleton browser: sign-in/verify sessions are
 * short-lived while workflow run sessions live for the whole run. Sharing one
 * instance would serialize independent work; sharing launch policy is what
 * keeps the paths consistent.
 */

export const DEFAULT_VIEWPORT = { width: 1366, height: 850 } as const;

export type BrowserConnection = 'existing-chrome' | 'persistent-profile' | 'vault-restored' | undefined;

export type LaunchOptions = {
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
  deviceScaleFactor?: number;
};

/**
 * Launch a headless persistent context under `dir`. The directory is created
 * on demand with owner-only permissions. Callers own disposal semantics:
 * a persistent operator profile lives across runs, a scratch profile is
 * disposable (see `openScratch`).
 */
export async function launchPersistent(
  dir: string,
  options: LaunchOptions = {},
): Promise<BrowserContext> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return chromium.launchPersistentContext(dir, {
    // Servers have no display. Playwright Chromium stays headless; do not open a window.
    headless: true,
    viewport: options.viewport ?? { ...DEFAULT_VIEWPORT },
    acceptDownloads: false,
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.timezoneId ? { timezoneId: options.timezoneId } : {}),
    ...(typeof options.deviceScaleFactor === 'number'
      ? { deviceScaleFactor: options.deviceScaleFactor }
      : {}),
  });
}

export function scratchDirectory(label: string): string {
  return runtimePath('chrome', 'scratch', label);
}

/** Throwaway scratch profile: created here, deleted by `dispose`. */
export async function openScratch(
  label: string,
  options: LaunchOptions = {},
): Promise<{ dir: string; context: BrowserContext; dispose: () => Promise<void> }> {
  const dir = scratchDirectory(label);
  const context = await launchPersistent(dir, options);
  return {
    dir,
    context,
    dispose: () => context.close().then(() => rm(dir, { recursive: true, force: true }).catch(() => {})),
  };
}

// Prefer Chrome that is already running with a local debugging endpoint.
// A normal Chrome window cannot be attached unless remote debugging was enabled.
const localCdpUrl = 'http://127.0.0.1:9222';

// An attached browser belongs to the desktop user, not to one automation run.
// Keep ONE CDP transport for the engine lifetime; never issue Browser.close to
// an external Chrome process. Each run owns and closes only its own tab.
let attachedBrowser: Browser | undefined;
let attachedAttempt: Promise<Browser> | undefined;
async function attachChrome(endpoint: string): Promise<Browser> {
  if (attachedBrowser?.isConnected()) return attachedBrowser;
  if (!attachedAttempt) {
    attachedAttempt = chromium
      .connectOverCDP(endpoint, { timeout: 6000 })
      .then((browser) => {
        attachedBrowser = browser;
        browser.on('disconnected', () => {
          if (attachedBrowser === browser) attachedBrowser = undefined;
          attachedAttempt = undefined;
        });
        return browser;
      })
      .catch((error) => {
        attachedAttempt = undefined;
        throw error;
      });
  }
  return attachedAttempt;
}

async function discoverRunningChrome(): Promise<string | undefined> {
  try {
    const response = await fetch(`${localCdpUrl}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return undefined;
    const metadata = (await response.json()) as {
      webSocketDebuggerUrl?: unknown;
    };
    return typeof metadata.webSocketDebuggerUrl === 'string' ? localCdpUrl : undefined;
  } catch {
    // Nothing is listening on the debugging port; use our persisted Chrome profile.
    return undefined;
  }
}

/** CDP endpoints must be loopback HTTP(S); parse and validate in one place. */
export function assertLoopbackCdp(cdpUrl: string): URL {
  const cdp = new URL(cdpUrl);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(cdp.hostname) ||
    !['http:', 'https:'].includes(cdp.protocol)
  )
    throw new Error('CDP must use loopback');
  return cdp;
}

export { attachChrome, discoverRunningChrome };

/** Validated screencast frame handed to `startScreencast` consumers. */
export type ScreencastFramePayload = {
  data: string;
  sessionId: number;
};

/**
 * Shared screencast plumbing: subscribe to CDP screencast frames, deliver
 * validated frames to `onFrame`, and ack so the browser keeps producing.
 * Stale frames self-replace; nothing here buffers or re-encodes content.
 */
export async function startScreencast(
  cdp: CDPSession,
  options: { quality?: number; maxWidth?: number; maxHeight?: number } = {},
  onFrame: (frame: ScreencastFramePayload) => void,
): Promise<void> {
  cdp.on('Page.screencastFrame', (frame: unknown) => {
    const shot = frame as { data?: unknown; sessionId?: unknown };
    if (typeof shot.data !== 'string' || typeof shot.sessionId !== 'number') return;
    try {
      onFrame({ data: shot.data, sessionId: shot.sessionId });
    } catch {
      /* a slow or failing frame consumer must not break streaming */
    }
    void cdp
      .send('Page.screencastFrameAck', { sessionId: shot.sessionId } as never)
      .catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: options.quality ?? 60,
    everyNthFrame: 1,
    maxWidth: options.maxWidth ?? 1280,
    maxHeight: options.maxHeight ?? 800,
  } as never);
}

/**
 * The browser surface connector sign-in/sync uses through dependency
 * injection. Real sessions also carry `beginView`/`frame`/`relay` for streamed
 * sign-in; those calls narrow to the concrete session, so optional test ports
 * (open/close/currentPage only) stay valid.
 */
export interface BrowserPort {
  open(platform: string, accountId?: string): Promise<Page>;
  close(): Promise<void>;
  readonly currentPage: Page | undefined;
}
