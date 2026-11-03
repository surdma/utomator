import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DocumentStore } from './documents.js';

/**
 * Shared persistence atoms.
 *
 * Single-user consistency here is guarded by two tiny mechanisms that used to
 * be restated in every store: a settled-tail write queue (the next write waits
 * for the previous write's end; a failure never blocks later writes) and an
 * atomic JSON replacement (owner-only temp directory, 0o600 temp file, rename).
 * A rejected queue entry must not stall the queue — each operation still
 * returns its own promise so callers observe their own failure.
 */

/** Serialize writes so two overlapping requests cannot lose each other. */
export function createWriteQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const operation = tail.then(task, task);
    tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}

/**
 * Atomically replace the JSON document at `path` (2-space pretty JSON with a
 * trailing newline). The directory is created on demand with owner-only
 * permissions. Callers that need extra final-path hardening (e.g. chmod) keep
 * doing so after this returns.
 */
export async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temp, path);
}

/**
 * Version-guarded document put: writes `value` only against the record's
 * current version, so an intervening writer is rejected instead of overwritten.
 */
export async function putLatestDocument<T>(
  documents: DocumentStore,
  namespace: string,
  key: string,
  value: T,
): Promise<void> {
  const existing = await documents.get<T>(namespace, key);
  await documents.put(namespace, key, value, existing?.version ?? 0);
}
