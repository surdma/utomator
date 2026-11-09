import { rm } from 'node:fs/promises';

/** Windows can keep a SQLite file locked after close until the process exits. Retry briefly, then let the OS reap a temp dir. */
export async function removeTemp(target: string) {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 40 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY') return;
    throw error;
  }
}
