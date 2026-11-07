import { resolve } from 'node:path';

/** Gitignored local runtime directory for logs, evidence, and browser profiles. */
export const RUNTIME_DIR = '.runtime';

/** Resolve a path beneath the runtime root (defaults to process.cwd()). */
export function runtimePath(...parts: string[]): string {
  return resolve(RUNTIME_DIR, ...parts);
}
