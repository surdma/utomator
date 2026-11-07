import type { DocumentStore } from '../db/documents.js';

/** A stored Growth template: the validated YAML program plus ownership
 * and revision metadata. The `program` is the compiled Growth program
 * returned by `compileGrowthProfileYaml`; `yaml` is the raw source. */
export interface StoredGrowthTemplate {
  id: string;
  version: number;
  ownerId: string;
  yaml: string;
  program: Record<string, unknown>;
}

/** Owner-scoped, revisioned storage for Growth templates.
 *
 * Growth YAML programs are stored as documents in the `growth-templates`
 * namespace. Each document is keyed by the template ID and carries an
 * ownerId. Writes use compare-and-swap (expectedVersion) for safe concurrent
 * updates. File-backed YAML remains the read-only default source; stored
 * templates override files when present. */
export class GrowthTemplateStore {
  private documents?: DocumentStore;
  private readonly ownerId: string;

  constructor(documents: DocumentStore | undefined, ownerId: string) {
    this.documents = documents;
    this.ownerId = ownerId;
  }

  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }

  async list(): Promise<StoredGrowthTemplate[]> {
    if (!this.documents) return [];
    const rows = await this.documents.list<StoredGrowthTemplate>('growth-templates');
    return rows
      .map((row) => row.value)
      .filter((value) => value.ownerId === this.ownerId || value.ownerId === undefined);
  }

  async get(id: string): Promise<StoredGrowthTemplate | null> {
    if (!this.documents) return null;
    const row = await this.documents.get<StoredGrowthTemplate>('growth-templates', id);
    if (!row) return null;
    const value = row.value;
    if (value.ownerId !== undefined && value.ownerId !== this.ownerId) return null;
    return value;
  }

  async put(template: StoredGrowthTemplate, expectedVersion: number): Promise<number> {
    if (!this.documents) throw Error('Document store not configured');
    const stored: StoredGrowthTemplate = {
      ...template,
      ownerId: template.ownerId ?? this.ownerId,
      version: template.version ?? 1,
    };
    return this.documents.put('growth-templates', template.id, stored, expectedVersion);
  }

  async remove(id: string, expectedVersion: number): Promise<void> {
    if (!this.documents) throw Error('Document store not configured');
    await this.documents.remove('growth-templates', id, expectedVersion);
  }
}
