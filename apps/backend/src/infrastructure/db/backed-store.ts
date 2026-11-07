import { readFile } from 'node:fs/promises';
import type { DocumentStore } from './documents.js';
import { createWriteQueue, putLatestDocument, writeAtomicJson } from './persistence.js';

export interface BackedStoreOptions<T> {
  /**
   * When true, a non-local tenant with no SQL record reads as the empty value
   * instead of falling through to the local operator's JSON file. Keeps hosted
   * tenants from inheriting local records.
   */
  ownerIsolation?: boolean;
  /** Custom JSON write (default: `writeAtomicJson`). E.g. to add `chmod(0o600)` after the write. */
  writeJson?: (path: string, value: T) => Promise<void>;
}

/**
 * Backing store for a single JSON document.
 *
 * Reads from the Drizzle document store when available, falling back to a
 * per-owner JSON file. Writes are serialized through a write queue (the same
 * conveyor as `createWriteQueue`) and use version-compare-and-swap against the
 * document store so an intervening writer is rejected instead of silently
 * overwritten.
 *
 * Each store keeps its own domain record type `T`; domain-specific validation,
 * revision checks, and authorization stay in the store class.
 */
export class BackedStore<T> {
  private readonly run = createWriteQueue();
  private documents?: DocumentStore;

  constructor(
    private readonly namespace: string,
    private readonly key: string,
    private readonly jsonPath: string,
    private readonly empty: T,
    private readonly opts: BackedStoreOptions<T> = {},
  ) {}

  setDocuments(documents: DocumentStore): void {
    this.documents = documents;
  }

  async get(): Promise<T> {
    if (this.documents) {
      const value = await this.documents.get<T>(this.namespace, this.key);
      if (value) return value.value;
      if (this.opts.ownerIsolation && this.documents.ownerId !== 'local-owner') return this.empty;
    }
    try {
      const raw = JSON.parse(await readFile(this.jsonPath, 'utf8')) as T;
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.empty;
      throw error;
    }
  }

  async update(modify: (current: T) => T): Promise<T> {
    return this.run(async () => {
      const current = await this.get();
      const next = modify(current);
      if (this.documents) {
        await putLatestDocument(this.documents, this.namespace, this.key, next);
      } else {
        await (this.opts.writeJson ?? writeAtomicJson)(this.jsonPath, next);
      }
      return next;
    });
  }
}
