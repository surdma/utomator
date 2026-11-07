import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Action, Platform } from '../../domain/types.js';
import { defaultPlan, templates, validatePlan, type WorkflowPlan } from '../../domain/workflow-plan.js';
import type { DocumentStore } from '../db/documents.js';

export class WorkflowPlanStore {
  private queue: Promise<unknown> = Promise.resolve();
  private documents?: DocumentStore;
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }
  constructor(private readonly root = resolve(process.cwd(), '.runtime', 'workflow-plans')) {}
  private pathFor(platform: Platform, action: Action): string {
    return resolve(this.root, `${platform}-${action}.json`);
  }

  async get(platform: Platform, action: Action): Promise<WorkflowPlan> {
    const fallback =
      platform === 'linkedin'
        ? (templates('linkedin').find((plan) => plan.action === action) ?? defaultPlan(platform, action))
        : defaultPlan(platform, action);
    if (this.documents) {
      const row = await this.documents.get<WorkflowPlan>('workflow-plans', `${platform}-${action}`);
      if (row) return validatePlan(row.value, platform, action);
    }
    if (this.documents && this.documents.ownerId !== 'local-owner') return fallback;
    try {
      const data: unknown = JSON.parse(await readFile(this.pathFor(platform, action), 'utf8'));
      return validatePlan(data, platform, action);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw error;
    }
  }

  listTemplates(platform: Platform) {
    return templates(platform);
  }

  save(platform: Platform, action: Action, raw: unknown): Promise<WorkflowPlan> {
    const plan = validatePlan(raw, platform, action);
    const operation = this.queue.then(async () => {
      if (this.documents) {
        const key = `${platform}-${action}`;
        const existing = await this.documents.get<WorkflowPlan>('workflow-plans', key);
        await this.documents.put('workflow-plans', key, plan, existing?.version ?? 0);
      } else {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const path = this.pathFor(platform, action);
        const temp = `${path}.${randomUUID()}`;
        await writeFile(temp, `${JSON.stringify(plan, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temp, path);
      }
      return plan;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
