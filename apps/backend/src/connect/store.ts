import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BackedStore } from '../db/backed-store.js';
import type { DocumentStore } from '../db/documents.js';
import { writeAtomicJson } from '../db/persistence.js';

/** One verified provider session, keyed by account ID. */
export type ConnectionRecord = {
  accountId: string;
  verifiedAt: string;
  platform: string;
  handle: string;
  profileUrl: string;
};

/** Atomic JSON write with owner-only final-path permissions (parity with the previous connector write path). */
export async function chmodmedJson(path: string, value: unknown): Promise<void> {
  await writeAtomicJson(path, value);
  await chmod(path, 0o600);
}

/**
 * Connector persistence: a single JSON/SQL document mapping account IDs to
 * verified session records. Validation and session lifecycle stay in the
 * service; this class owns only the records/get/compare-swap surface.
 */
export class ConnectorRecordStore {
  private readonly store: BackedStore<Record<string, ConnectionRecord>>;
  private documents?: DocumentStore;

  setDocuments(documents: DocumentStore): void {
    this.documents = documents;
    this.store.setDocuments(documents);
  }

  constructor(root = process.cwd()) {
    this.store = new BackedStore<Record<string, ConnectionRecord>>(
      'connectors',
      'sessions',
      resolve(root, '.runtime', 'connectors.json'),
      {},
      { ownerIsolation: true, writeJson: chmodmedJson },
    );
  }

  get(): Promise<Record<string, ConnectionRecord>> {
    return this.store.get();
  }

  async update(id: string, record: ConnectionRecord | null): Promise<void> {
    // The write queue serializes read/modify/write so two sync requests cannot lose each other.
    await this.store.update((all) => {
      if (record) all[id] = record;
      else delete all[id];
      return all;
    });
  }
}
