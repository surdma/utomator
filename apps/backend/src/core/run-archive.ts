import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { RunSummary } from './types.js';

export interface ArchivedRun {
  summary: RunSummary;
  stepIds: string[];
}
const runIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stepIdPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const states = new Set([
  'running',
  'paused',
  'input-needed',
  'approval-needed',
  'completed',
  'blocked',
  'failed',
  'cancelled',
]);
const terminals = new Set(['completed', 'blocked', 'failed', 'cancelled']);
const actions = new Set([
  'audit',
  'audit-page',
  'edit-profile',
  'add-skill',
  'compose-post',
  'pin-post',
  'delete-post',
  'edit-experience',
  'edit-website',
  'edit-services',
  'add-project',
  'add-featured',
  'upload-banner',
]);

function checkedRunId(id: string): string {
  if (typeof id !== 'string' || !runIdPattern.test(id))
    throw Error('Invalid run identifier');
  return id.toLowerCase();
}
function parsedEntry(raw: unknown, id: string): ArchivedRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<ArchivedRun>;
  const s = entry.summary;
  if (
    !s ||
    s.id !== id ||
    !['linkedin', 'x'].includes(s.platform) ||
    !actions.has(s.action) ||
    !states.has(s.state) ||
    typeof s.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(s.createdAt)) ||
    !Array.isArray(entry.stepIds) ||
    entry.stepIds.length > 24 ||
    !entry.stepIds.every(
      (v) => typeof v === 'string' && stepIdPattern.test(v)
    ) ||
    new Set(entry.stepIds).size !== entry.stepIds.length ||
    (s.completedStepIds !== undefined &&
      (!Array.isArray(s.completedStepIds) ||
        !s.completedStepIds.every((v) => entry.stepIds!.includes(v))))
  )
    return null;
  return { summary: s, stepIds: entry.stepIds };
}

/** Local-only durable run discovery. No browser session or authorization is restored. */
export class RunArchive {
  private entries = new Map<string, ArchivedRun>();
  constructor(private readonly root = resolve('.runtime', 'runs')) {}

  pathFor(id: string): string {
    return resolve(this.root, checkedRunId(id));
  }

  save(summary: RunSummary, stepIds: readonly string[]): void {
    const id = checkedRunId(summary.id);
    if (stepIds.length > 24 || stepIds.some((v) => !stepIdPattern.test(v)))
      throw Error('Invalid archived workflow step identifiers');
    const durableSummary = { ...summary };
    delete durableSummary.checkpoint;
    const entry = { summary: durableSummary, stepIds: [...stepIds] };
    mkdirSync(this.pathFor(id), { recursive: true, mode: 0o700 });
    const dest = resolve(this.pathFor(id), 'summary.json');
    const temp = dest + '.' + randomUUID();
    writeFileSync(temp, JSON.stringify(entry) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      renameSync(temp, dest);
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {
        /* already moved */
      }
      throw error;
    }
    this.entries.set(id, entry);
  }

  restore(limit = 100): ArchivedRun[] {
    let names: string[] = [];
    try {
      names = readdirSync(this.root, { withFileTypes: true })
        .filter((item) => item.isDirectory() && runIdPattern.test(item.name))
        .map((item) => item.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const records: ArchivedRun[] = [];
    for (const name of names) {
      try {
        const entry = parsedEntry(
          JSON.parse(
            readFileSync(resolve(this.pathFor(name), 'summary.json'), 'utf8')
          ) as unknown,
          name
        );
        if (entry) records.push(entry);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
          !(error instanceof SyntaxError)
        )
          throw error;
      }
    }
    records.sort(
      (a, b) =>
        b.summary.createdAt.localeCompare(a.summary.createdAt) ||
        b.summary.id.localeCompare(a.summary.id)
    );
    this.entries.clear();
    for (const record of records.slice(0, limit)) {
      if (!terminals.has(record.summary.state)) {
        record.summary.state = 'failed';
        record.summary.error =
          'Run interrupted by an automation engine restart; the browser session was not resumed';
        record.summary.checkpoint = undefined;
      }
      this.entries.set(record.summary.id, record);
    }
    return [...this.entries.values()];
  }

  hasStep(runId: string, stepId: string): boolean {
    if (!stepIdPattern.test(stepId) || !runIdPattern.test(runId)) return false;
    return this.entries.get(runId)?.stepIds.includes(stepId) ?? false;
  }

  readArtifact(
    runId: string,
    stepId?: string,
    extension: 'yaml' | 'output.json' = 'yaml'
  ): string | null {
    if (!runIdPattern.test(runId) || !this.entries.has(runId)) return null;
    if (stepId !== undefined && !this.hasStep(runId, stepId)) return null;
    const filename =
      stepId === undefined ? 'workflow.yaml' : stepId + '.' + extension;
    try {
      return readFileSync(resolve(this.pathFor(runId), filename), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
