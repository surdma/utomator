import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePlan, templates, type WorkflowPlan } from './workflow-plan.js';
import type { Action, Platform } from './types.js';
import type { DocumentStore } from '../db/documents.js';

export interface WorkflowRecord {
  id: string;
  ownerId: string;
  templateId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  plan: WorkflowPlan;
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const templatePattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;

function validatedPlan(raw: unknown): WorkflowPlan {
  if (!raw || typeof raw !== 'object')
    throw Error('Workflow definition is required');
  const plan = raw as Partial<WorkflowPlan>;
  return validatePlan(raw, plan.platform as Platform, plan.action as Action);
}
function checkedId(id: string): string {
  if (typeof id !== 'string' || !uuidPattern.test(id))
    throw Error('Invalid workflow identifier');
  return id.toLowerCase();
}
function checkedTemplateId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !templatePattern.test(value))
    throw Error('Invalid template identifier');
  return value;
}

/** Revisioned user workflows independent from immutable template catalogue entries. */
export class WorkflowRegistry {
  private queue: Promise<unknown> = Promise.resolve();
  private documents?: DocumentStore;
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }
  constructor(
    private readonly root = resolve(process.cwd(), '.runtime', 'workflows'),
    private readonly legacyRoot = resolve(
      process.cwd(),
      '.runtime',
      'workflow-plans'
    )
  ) {}
  private pathFor(id: string): string {
    return resolve(this.root, checkedId(id) + '.json');
  }
  private revisionPath(id: string, revision: number): string {
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw Error('Invalid workflow revision');
    return resolve(this.root, 'revisions', checkedId(id), revision + '.json');
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async atomic(path: string, contents: string): Promise<void> {
    const temp = path + '.' + randomUUID();
    await writeFile(temp, contents, { mode: 0o600, flag: 'wx' });
    try {
      await rename(temp, path);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }
  private async persist(record: WorkflowRecord): Promise<void> {
    if (this.documents) {
      const current = await this.documents.get<WorkflowRecord>(
        'workflows',
        record.id
      );
      const revisionKey = record.id + ':' + record.revision;
      const revision = await this.documents.get<WorkflowRecord>(
        'workflow-revisions',
        revisionKey
      );
      if (revision)
        throw Error('Version conflict: workflow revision already exists');
      await this.documents.put('workflow-revisions', revisionKey, record, 0);
      try {
        await this.documents.put(
          'workflows',
          record.id,
          record,
          current?.version ?? 0
        );
      } catch (error) {
        await this.documents
          .remove('workflow-revisions', revisionKey, 1)
          .catch(() => undefined);
        throw error;
      }
      return;
    }
    await mkdir(resolve(this.root, 'revisions', record.id), {
      recursive: true,
      mode: 0o700,
    });
    // The snapshot is created exactly once; the mutable pointer is updated only afterward.
    const revisionPath = this.revisionPath(record.id, record.revision);
    await writeFile(revisionPath, JSON.stringify(record, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await this.atomic(
        this.pathFor(record.id),
        JSON.stringify(record, null, 2) + '\n'
      );
    } catch (error) {
      await unlink(revisionPath).catch(() => undefined);
      throw error;
    }
  }
  async get(id: string, revision?: number): Promise<WorkflowRecord | null> {
    const path =
      revision === undefined
        ? this.pathFor(id)
        : this.revisionPath(id, revision);
    try {
      const stored = this.documents
        ? await this.documents.get<WorkflowRecord>(
            revision === undefined ? 'workflows' : 'workflow-revisions',
            revision === undefined
              ? checkedId(id)
              : checkedId(id) + ':' + revision
          )
        : null;
      if (this.documents && this.documents.ownerId !== 'local-owner' && !stored)
        return null;
      const record = stored
        ? stored.value
        : (JSON.parse(await readFile(path, 'utf8')) as WorkflowRecord);
      if (
        record.id !== checkedId(id) ||
        record.ownerId !== (this.documents?.ownerId ?? 'local-owner') ||
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        (revision !== undefined && record.revision !== revision)
      )
        throw Error('Invalid saved workflow');
      record.plan = validatedPlan(record.plan);
      record.templateId = checkedTemplateId(record.templateId);
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async create(raw: unknown, templateId?: unknown): Promise<WorkflowRecord> {
    const plan = validatedPlan(raw);
    const provenance = checkedTemplateId(templateId);
    return this.serialize(async () => {
      const now = new Date().toISOString();
      const record: WorkflowRecord = {
        id: randomUUID(),
        ownerId: this.documents?.ownerId ?? 'local-owner',
        templateId: provenance,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        plan,
      };
      await this.persist(record);
      return record;
    });
  }
  async update(
    id: string,
    expectedRevision: number,
    raw: unknown
  ): Promise<WorkflowRecord> {
    const key = checkedId(id);
    const plan = validatedPlan(raw);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw Error('Expected workflow revision required');
    return this.serialize(async () => {
      const previous = await this.get(key);
      if (!previous) throw Error('Workflow not found');
      if (previous.revision !== expectedRevision)
        throw Error('Version conflict: workflow changed');
      const record: WorkflowRecord = {
        ...previous,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
        plan,
      };
      await this.persist(record);
      return record;
    });
  }
  /** One-time, idempotent import; old platform/action files are never deleted. */
  private async migrateLegacy(): Promise<void> {
    if (this.documents && this.documents.ownerId !== 'local-owner') return;
    for (const platform of ['linkedin', 'x'] as const) {
      for (const template of templates(platform)) {
        const key = platform + '-' + template.action;
        const digest = createHash('sha256')
          .update('utomator:legacy:' + key)
          .digest('hex');
        const id =
          digest.slice(0, 8) +
          '-' +
          digest.slice(8, 12) +
          '-4' +
          digest.slice(13, 16) +
          '-8' +
          digest.slice(17, 20) +
          '-' +
          digest.slice(20, 32);
        if (await this.get(id)) continue;
        let plan: WorkflowPlan;
        try {
          plan = validatedPlan(
            JSON.parse(
              await readFile(resolve(this.legacyRoot, key + '.json'), 'utf8')
            )
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        const now = new Date().toISOString();
        await this.persist({
          id,
          ownerId: 'local-owner',
          templateId: 'legacy-' + key,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          plan,
        });
      }
    }
  }
  async list(): Promise<WorkflowRecord[]> {
    return this.serialize(async () => {
      await this.migrateLegacy();
      let names: string[];
      try {
        names = await readdir(this.root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') names = [];
        else throw error;
      }
      const records: WorkflowRecord[] = [];
      if (this.documents) {
        const dbRecords =
          await this.documents.list<WorkflowRecord>('workflows');
        for (const row of dbRecords) {
          const record = await this.get(row.key);
          if (record) records.push(record);
        }
      }
      for (const name of this.documents?.ownerId === 'local-owner' ||
      !this.documents
        ? names
        : []) {
        if (!name.endsWith('.json') || !uuidPattern.test(name.slice(0, -5)))
          continue;
        const record = await this.get(name.slice(0, -5));
        if (record && !records.some((current) => current.id === record.id))
          records.push(record);
      }
      return records.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
      );
    });
  }
}
