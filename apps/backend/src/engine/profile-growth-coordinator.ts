import { createHash, randomUUID } from 'node:crypto';
import type { RunSummary } from '../core/types.js';
import { validateProfileUrl } from '../core/validate.js';
import type { DocumentStore } from '../db/documents.js';
import type { Runner } from '../runs/runner.js';
import { readGrowthTemplate } from './growth-profile.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type GrowthProgram = NonNullable<Awaited<ReturnType<typeof readGrowthTemplate>>>['program'];
type RunnerProgram = Extract<GrowthProgram, { kind: 'GrowthProfileWorkflow' | 'GrowthWorkflow' }>;
type ProfileStage = RunnerProgram['stages'][number];
type CoverageInput = { sectionId: string; text: string };
type StoredStage = {
  id: string;
  title: string;
  action: 'audit' | 'audit-page';
  page: ProfileStage['page'];
  sectionIds: string[];
  dependsOn: string;
  childRunId: string | null;
  pageEvidence: { url: string; digest: string } | null;
  plan: ProfileStage['plan'];
};
type OwnerEvidence = {
  source: 'owner-supplied';
  excerpt: string;
  digest: string;
  capturedAt: string;
};
export type ProfileGrowthRun = {
  id: string;
  programId: string;
  programVersion: number;
  sourceDigest: string;
  accountId: string;
  profileUrl: string;
  createdAt: string;
  finishedAt: string | null;
  status: 'active' | 'completed-with-gaps' | 'completed-with-owner-evidence';
  activeIndex: number;
  stages: StoredStage[];
  ownerEvidence: Record<string, OwnerEvidence>;
};
type Stored = { version: number; value: ProfileGrowthRun };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const allowed = (value: string) => typeof value === 'string' && uuid.test(value);
/**
 * Composes six verified read-only WorkflowPlans. Browser work, checkpoint approval,
 * run evidence, session ownership and cancellation stay inside the existing Runner.
 * No section is represented as provider-verified merely because a page was visited.
 */
export class ProfileGrowthCoordinator {
  private documents?: DocumentStore;
  private records = new Map<string, Stored>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly runner: Runner) {}
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async read(id: string): Promise<Stored | null> {
    if (!allowed(id)) return null;
    if (this.documents) {
      const record = await this.documents.get<ProfileGrowthRun>('growth-runs', id);
      return record ? { version: record.version, value: record.value } : null;
    }
    return this.records.get(id) ?? null;
  }
  private async write(value: ProfileGrowthRun, expected: number): Promise<void> {
    if (this.documents) {
      await this.documents.put('growth-runs', value.id, value, expected);
      return;
    }
    const previous = this.records.get(value.id);
    if ((previous?.version ?? 0) !== expected) throw Error('Growth run version conflict');
    this.records.set(value.id, {
      version: expected + 1,
      value: structuredClone(value),
    });
  }
  private openStage(run: ProfileGrowthRun, stageIndex: number): RunSummary {
    const stage = run.stages[stageIndex];
    if (!stage) throw Error('Growth stage not found');
    if (!stage.plan)
      throw Error('Legacy Growth run has no pinned YAML task plan. Start a new Growth run.');
    const base = run.profileUrl.replace(/\/$/, '');
    const pageUrl = stage.action === 'audit-page' ? base + '/details/' + stage.page + '/' : undefined;
    return this.runner.start({
      platform: 'linkedin',
      action: stage.action,
      accountId: run.accountId,
      profileUrl: run.profileUrl,
      ...(pageUrl ? { pageUrl } : {}),
      workflow: stage.plan,
    });
  }
  private summarize(value: ProfileGrowthRun) {
    const stage = value.stages[value.activeIndex];
    const child = stage?.childRunId ? (this.runner.get(stage.childRunId) ?? null) : null;
    const sectionIds = [...new Set(value.stages.flatMap((item) => item.sectionIds))];
    const coverage = sectionIds.map((id) => ({
      id,
      stageId: value.stages.find((item) => item.sectionIds.includes(id))!.id,
      status: value.ownerEvidence[id] ? ('owner-supplied-unverified' as const) : ('missing' as const),
      evidence: value.ownerEvidence[id] ?? null,
    }));
    const output =
      child && stage?.childRunId
        ? this.runner.stepOutput(
            stage.childRunId,
            stage.action === 'audit-page' ? 'sectionEvidence' : 'baseline',
          )
        : null;
    const pageEvidence =
      output?.schema === 'evidence/v1' ? { url: output.url, digest: output.digest } : null;
    const counts = {
      total: sectionIds.length,
      ownerSupplied: coverage.filter((c) => c.evidence).length,
      missing: coverage.filter((c) => !c.evidence).length,
      independentlyProviderVerified: 0,
    };
    const childState = child?.state ?? (value.status === 'active' ? 'unavailable' : null);
    const releasePending =
      value.status === 'active' && childState === 'completed' && !this.runner.isIdle();
    return {
      ...value,
      currentChild: child,
      currentStage: stage,
      pipelineRuns: value.stages.map((item) => ({
        id: item.id,
        childRunId: item.childRunId,
        state: item.childRunId ? (this.runner.get(item.childRunId)?.state ?? 'unavailable') : 'waiting',
        currentStepId: item.childRunId
          ? (this.runner.get(item.childRunId)?.currentStepId ?? null)
          : null,
        error: item.childRunId ? (this.runner.get(item.childRunId)?.error ?? null) : null,
      })),
      currentPageEvidence: pageEvidence,
      coverage,
      counts,
      state: value.status === 'active' ? childState : value.status,
      canAdvance:
        value.status === 'active' &&
        childState === 'completed' &&
        Boolean(pageEvidence) &&
        !releasePending,
      releasePending,
      outcomeNotice:
        'Read-only browser observations and owner-supplied evidence are recorded separately. No section is independently provider-verified and no external profile change or growth outcome is claimed.',
    };
  }

  async start(accountId: string, profileUrl: string, templateId = 'linkedin-profile') {
    return this.serial(async () => {
      if (!allowed(accountId)) throw Error('Verified LinkedIn account ID required');
      const normalized = validateProfileUrl('linkedin', profileUrl).href;
      const template = await readGrowthTemplate(templateId);
      if (!template) throw Error('Growth YAML template not found');
      const { program, yaml } = template;
      if (program.kind === 'GrowthBlueprintWorkflow')
        throw Error('Design-only Growth blueprints cannot execute through Runner');
      const run: ProfileGrowthRun = {
        id: randomUUID(),
        programId: program.id,
        programVersion: program.version,
        sourceDigest: digest(yaml),
        accountId,
        profileUrl: normalized,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        status: 'active',
        activeIndex: 0,
        stages: program.stages.map((stage) => ({
          id: stage.id,
          title: stage.title,
          action: stage.action,
          page: stage.page,
          sectionIds: [...stage.sectionIds],
          dependsOn: stage.dependsOn,
          plan: stage.plan,
          childRunId: null,
          pageEvidence: null,
        })),
        ownerEvidence: {},
      };
      // The Runner is the only executor. An unavailable active browser fails
      // before a new program record is made.
      const child = this.openStage(run, 0);
      run.stages[0]!.childRunId = child.id;
      try {
        await this.write(run, 0);
      } catch (error) {
        this.runner.cancel(child.id);
        throw error;
      }
      return this.summarize(run);
    });
  }
  async get(id: string) {
    const stored = await this.read(id);
    return stored ? this.summarize(stored.value) : null;
  }
  async list() {
    if (this.documents) {
      const rows = await this.documents.list<ProfileGrowthRun>('growth-runs');
      return rows
        .map((row) => this.summarize(row.value))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
    }
    return [...this.records.values()]
      .map((item) => this.summarize(item.value))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }
  async supplyEvidence(id: string, input: CoverageInput) {
    return this.serial(async () => {
      const stored = await this.read(id);
      if (!stored) throw Error('Growth run not found');
      const run = structuredClone(stored.value);
      if (run.status !== 'active') throw Error('Growth run is already finalized');
      const stage = run.stages[run.activeIndex]!;
      if (
        !stage.sectionIds.includes(input.sectionId) ||
        (run.programId === 'linkedin-profile' && stage.id === 'review')
      )
        throw Error('Supply evidence for a section assigned to the current stage');
      const excerpt = typeof input.text === 'string' ? input.text.trim() : '';
      if (excerpt.length < 10 || excerpt.length > 1500)
        throw Error('Owner evidence must be 10–1500 characters');
      run.ownerEvidence[input.sectionId] = {
        source: 'owner-supplied',
        excerpt,
        digest: digest(excerpt),
        capturedAt: new Date().toISOString(),
      };
      await this.write(run, stored.version);
      return this.summarize(run);
    });
  }
  async advance(id: string) {
    return this.serial(async () => {
      const stored = await this.read(id);
      if (!stored) throw Error('Growth run not found');
      const run = structuredClone(stored.value);
      if (run.status !== 'active') throw Error('Growth workflow already finalized');
      const stage = run.stages[run.activeIndex]!;
      const child = stage.childRunId ? this.runner.get(stage.childRunId) : undefined;
      if (!child || child.state !== 'completed')
        throw Error('Current Runner pipeline has not completed its approvals and evidence');
      // Runner marks the child completed before async browser cleanup finishes.
      // Do not start the next child while the prior browser still owns this Runner.
      if (!this.runner.isIdle())
        throw Error('Runner browser session is still closing; retry when the Runner is idle');
      const proof = this.runner.stepOutput(
        child.id,
        stage.action === 'audit-page' ? 'sectionEvidence' : 'baseline',
      );
      if (!proof || proof.schema !== 'evidence/v1')
        throw Error('Runner did not produce its required real page evidence');
      stage.pageEvidence = { url: proof.url, digest: proof.digest };
      if (run.activeIndex === run.stages.length - 1) {
        run.finishedAt = new Date().toISOString();
        run.status =
          Object.keys(run.ownerEvidence).length <
          new Set(run.stages.flatMap((item) => item.sectionIds)).size
            ? 'completed-with-gaps'
            : 'completed-with-owner-evidence';
        await this.write(run, stored.version);
        return this.summarize(run);
      }
      const nextIndex = run.activeIndex + 1;
      const next = run.stages[nextIndex]!;
      if (next.dependsOn !== stage.id) throw Error('Unresolved Growth stage dependency');
      // The previous Runner must have released its browser before this call.
      const started = this.openStage(run, nextIndex);
      next.childRunId = started.id;
      run.activeIndex = nextIndex;
      try {
        await this.write(run, stored.version);
      } catch (error) {
        this.runner.cancel(started.id);
        throw error;
      }
      return this.summarize(run);
    });
  }
}
