import type { Page } from 'playwright';

/** Network-class failures are retried; everything else surfaces immediately. */
export const isConnectionTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  /net::ERR_CONNECTION_TIMED_OUT|net::ERR_CONNECTION_REFUSED|net::ERR_NAME_NOT_RESOLVED/i.test(
    error.message,
  );

/**
 * Navigate with exponential backoff retries. The first attempt uses the
 * caller-supplied timeout; subsequent attempts double the wait between tries.
 * Never retries navigation that left the official platform.
 */
export async function navigateWithRetry(
  page: Page,
  url: string,
  opts: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    timeout?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
  } = {},
): Promise<void> {
  const { waitUntil, timeout, maxAttempts = 3, baseDelayMs = 2000 } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      if (!isConnectionTimeout(error)) break; // non-network errors are not retried
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}

/** Provider sign-in entry points for streamed (hosted) sign-in. */
export const streamSignInUrl = {
  linkedin: 'https://www.linkedin.com/login/',
  x: 'https://x.com/i/flow/login',
} as const;
