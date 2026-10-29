import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CareerDocument } from '../profile/career-store.js';
import { validateProfileUrl } from './validate.js';
import { loadIdentityTimeline } from '../profile/timeline.js';
import {
  evidenceRecord,
  approvalDecision,
  isEvidenceRecord,
  isApprovalFor,
} from './evidence-approval.js';

type State = 'approval-needed' | 'selection-needed' | 'completed' | 'declined';
type StageState = 'completed' | 'waiting' | 'pending' | 'declined';
type StageId = 'context' | 'assessment' | 'proposals' | 'approval' | 'selection' | 'report';
const chain: readonly { id: StageId; operation: string; input: string; output: string }[] = [
  {
    id: 'context',
    operation: 'load-account-career-evidence',
    input: 'local-career/v1',
    output: 'owner-evidence/v1',
  },
  {
    id: 'assessment',
    operation: 'assess-profile-evidence',
    input: 'owner-evidence/v1',
    output: 'assessment/v1',
  },
  {
    id: 'proposals',
    operation: 'prepare-grounded-proposals',
    input: 'assessment/v1',
    output: 'proposals/v1',
  },
  { id: 'approval', operation: 'request-owner-approval', input: 'proposals/v1', output: 'approval/v1' },
  {
    id: 'selection',
    operation: 'select-approved-proposals',
    input: 'approval/v1',
    output: 'selection/v1',
  },
  { id: 'report', operation: 'create-manual-review-report', input: 'selection/v1', output: 'report/v1' },
];
export type ProfileProposal = {
  id: 'headline' | 'about' | 'experience' | 'featured';
  section: string;
  proposed: string;
  source: string;
  reason: string;
  status: 'draft-for-review';
};
export type PlanningStage = {
  id: StageId;
  operation: string;
  state: StageState;
  inputSchema: string;
  outputSchema: string;
  output?: unknown;
};
export type PlanningReport = {
  planningOnly: true;
  websiteActionsExecuted: false;
  modelConnected: false;
  approvedIds: string[];
  proposedChanges: ProfileProposal[];
  outstanding: string[];
  notice: string;
};
export type ProfilePlanningRun = {
  id: string;
  templateId: 'li-full';
  state: State;
  createdAt: string;
  updatedAt: string;
  source: 'portfolio-source' | 'account-career';
  accountId?: string;
  profileUrl: string;
  observedHeadline: string | null;
  stages: PlanningStage[];
  proposals: ProfileProposal[];
  report?: PlanningReport;
};
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkedId(id: string): string {
  if (!idPattern.test(id)) throw Error('Invalid optimization run ID');
  return id.toLowerCase();
}
function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export type ProfilePlanningInput = {
  accountId: string;
  profileUrl: string;
  career: CareerDocument;
  careerRevision: number;
};
function sourceEvidence(run: ProfilePlanningRun) {
  const owner = record(run.stages[0]?.output);
  const payload =
    run.source === 'account-career'
      ? {
          accountId: owner.accountId,
          careerRevision: owner.careerRevision,
          facts: owner.facts,
          proposals: run.proposals,
        }
      : { facts: owner.facts ?? owner, proposals: run.proposals };
  if (
    run.source === 'account-career' &&
    (run.accountId !== owner.accountId || !idPattern.test(String(owner.accountId)))
  )
    throw Error('Stored evidence belongs to another social account');
  const expected = evidenceRecord(
    'context',
    'owner-evidence/v1',
    run.profileUrl,
    JSON.stringify(payload),
  );
  if (
    owner.evidenceRef !== undefined &&
    (!isEvidenceRecord(owner.evidenceRef) ||
      owner.evidenceRef.digest !== expected.digest ||
      owner.evidenceRef.url !== expected.url ||
      owner.evidenceRef.sourceStepId !== expected.sourceStepId ||
      owner.evidenceRef.sourceSchema !== expected.sourceSchema)
  )
    throw Error('Stored evidence reference does not match owner facts');
  return expected;
}
const snapshot = (run: ProfilePlanningRun): string => JSON.stringify(run, null, 2) + '\n';
const scalar = (value: string) => JSON.stringify(value);
export function planningManifest(): { manifest: string; steps: Record<StageId, string> } {
  const docs = {} as Record<StageId, string>;
  for (let i = 0; i < chain.length; i++) {
    const stage = chain[i]!;
    docs[stage.id] = [
      'apiVersion: "utomator.dev/v1"',
      'kind: "ProfilePlanningStep"',
      'metadata:',
      '  id: ' + scalar(stage.id),
      'spec:',
      '  operation: ' + scalar(stage.operation),
      '  inputSchema: ' + scalar(stage.input),
      '  outputSchema: ' + scalar(stage.output),
      '  sourceStep: ' + (i === 0 ? 'null' : scalar(chain[i - 1]!.id)),
      '  providerMutation: false',
      '',
    ].join('\n');
  }
  return {
    manifest: [
      'apiVersion: "utomator.dev/v1"',
      'kind: "ProfilePlanningWorkflow"',
      'metadata:',
      '  templateId: "li-full"',
      'spec:',
      '  platform: "linkedin"',
      '  execution: "manual-planning"',
      '  modelConnected: false',
      '  steps:',
      ...chain.map((s) => '    - ' + scalar(s.id)),
      '',
    ].join('\n'),
    steps: docs,
  };
}
/** Read-only deterministic planning from the explicitly selected social account
 * and saved local career source. No browser mutation, social API or LLM. */
export class ProfilePlanner {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly root = resolve(process.cwd(), '.runtime', 'profile-plans'),
    private readonly timelineLoader = loadIdentityTimeline,
  ) {}
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const promise = this.queue.then(work);
    this.queue = promise.catch(() => undefined);
    return promise;
  }
  private path(id: string) {
    return resolve(this.root, checkedId(id) + '.json');
  }
  private async persist(run: ProfilePlanningRun): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const destination = this.path(run.id),
      temporary = destination + '.' + randomUUID();
    await writeFile(temporary, snapshot(run), { mode: 0o600, flag: 'wx' });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
  async get(id: string): Promise<ProfilePlanningRun | null> {
    try {
      const value = JSON.parse(await readFile(this.path(id), 'utf8')) as ProfilePlanningRun;
      if (
        value.id !== checkedId(id) ||
        value.templateId !== 'li-full' ||
        !Array.isArray(value.stages) ||
        value.stages.length !== 6
      )
        throw Error('Invalid saved profile planning record');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async start(input: ProfilePlanningInput): Promise<ProfilePlanningRun> {
    return this.serialized(async () => {
      if (
        !idPattern.test(input.accountId) ||
        !Number.isSafeInteger(input.careerRevision) ||
        input.careerRevision < 1
      )
        throw Error('Select an account with a saved career source');
      const url = validateProfileUrl('linkedin', input.profileUrl).href;
      const career = input.career;
      const role = text(career.headline, 220);
      const about = text(career.summary, 2600);
      if (!text(career.name, 150) || !role)
        throw Error('Complete your career source name and professional headline first');
      const experience = career.experience.find((row) => text(row.company, 120) && text(row.role, 120));
      const experienceLines =
        experience?.bullets.map((v) => text(v, 400)).filter((v): v is string => Boolean(v)) ?? [];
      const featured = career.projects.find((row) => text(row.title, 150));
      const ownerEvidence = {
        profileUrl: url,
        accountId: input.accountId,
        sourceFiles: ['local Utomator career workspace'],
        careerRevision: input.careerRevision,
        facts: {
          headline: role,
          about,
          experience: experience
            ? [
                text(experience.role, 120) + ' · ' + text(experience.company, 120),
                ...experienceLines.slice(0, 3),
              ].join('\n')
            : null,
          featured: featured ? text(featured.title, 150) : null,
        },
      };
      const timeline = await this.timelineLoader();
      const matched = timeline.find(
        (event) =>
          event.platform === 'linkedin' &&
          event.url.replace(/\/$/, '') === ownerEvidence.profileUrl.replace(/\/$/, ''),
      );
      const observedHeadline = text(matched?.headline, 300);
      // The proposal generator consumes the assessment's typed, source-bounded
      // facts. It cannot supplement missing profile fields with invented text.
      const assessment = {
        source: 'saved Utomator career source',
        profileUrl: ownerEvidence.profileUrl,
        facts: ownerEvidence.facts,
        observedHeadline: observedHeadline ?? null,
        lastObservation: matched?.timestamp ?? null,
        comparisonStatus: observedHeadline ? 'headline-observed-only' : 'live-profile-not-observed',
        sectionsWithoutLiveEvidence: ['About', 'Experience', 'Services', 'Projects', 'Featured'],
        advisory:
          'Career data entered in this workspace is not proof of the live LinkedIn page or permission to edit it.',
      };
      const proposals: ProfileProposal[] = [];
      if (assessment.facts.headline)
        proposals.push({
          id: 'headline',
          section: 'Headline',
          proposed: assessment.facts.headline,
          source: 'utomator:career.profile.headline',
          reason:
            'Owner-supplied professional positioning. Review actual LinkedIn headline before changing.',
          status: 'draft-for-review',
        });
      if (assessment.facts.about)
        proposals.push({
          id: 'about',
          section: 'About',
          proposed: assessment.facts.about,
          source: 'utomator:career.profile.summary',
          reason:
            'Draft from the saved career source. Confirm this information belongs to the selected account.',
          status: 'draft-for-review',
        });
      if (assessment.facts.experience)
        proposals.push({
          id: 'experience',
          section: 'Experience',
          proposed: assessment.facts.experience,
          source: 'utomator:career.profile.experience',
          reason:
            'Saved career experience, not verified LinkedIn experience. Confirm dates and position IDs.',
          status: 'draft-for-review',
        });
      if (assessment.facts.featured)
        proposals.push({
          id: 'featured',
          section: 'Featured',
          proposed: assessment.facts.featured,
          source: 'utomator:career.profile.projects',
          reason:
            'Saved career project candidate. Confirm the account owner wants it featured on LinkedIn.',
          status: 'draft-for-review',
        });
      if (!proposals.length) throw Error('No factual profile fields found for an optimization proposal');
      const stages: PlanningStage[] = chain.map((stage, i) => ({
        id: stage.id,
        operation: stage.operation,
        inputSchema: stage.input,
        outputSchema: stage.output,
        state: i < 3 ? 'completed' : i === 3 ? 'waiting' : 'pending',
        ...(i === 0
          ? {
              output: {
                ...ownerEvidence,
                evidenceRef: evidenceRecord(
                  'context',
                  'owner-evidence/v1',
                  ownerEvidence.profileUrl,
                  JSON.stringify({
                    accountId: input.accountId,
                    careerRevision: input.careerRevision,
                    facts: ownerEvidence.facts,
                    proposals,
                  }),
                ),
              },
            }
          : i === 1
            ? { output: assessment }
            : i === 2
              ? { output: { items: proposals } }
              : {}),
      }));
      const now = new Date().toISOString();
      const run: ProfilePlanningRun = {
        id: randomUUID(),
        templateId: 'li-full',
        state: 'approval-needed',
        createdAt: now,
        updatedAt: now,
        source: 'account-career',
        accountId: input.accountId,
        profileUrl: url,
        observedHeadline: observedHeadline ?? null,
        stages,
        proposals,
      };
      const yaml = planningManifest(),
        dir = resolve(this.root, 'steps', run.id);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      try {
        await writeFile(resolve(dir, 'workflow.yaml'), yaml.manifest, { flag: 'wx', mode: 0o600 });
        for (const [step, definition] of Object.entries(yaml.steps))
          await writeFile(resolve(dir, step + '.yaml'), definition, { flag: 'wx', mode: 0o600 });
        await this.persist(run);
      } catch (error) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      return run;
    });
  }
  async decide(id: string, approved: boolean): Promise<ProfilePlanningRun> {
    return this.serialized(async () => {
      const run = await this.get(id);
      if (!run) throw Error('Optimization run not found');
      if (run.state !== 'approval-needed') throw Error('Approval checkpoint already resolved');
      run.state = approved ? 'selection-needed' : 'declined';
      run.stages[3]!.state = approved ? 'completed' : 'declined';
      const evidence = sourceEvidence(run);
      run.stages[3]!.output = approvalDecision(evidence, approved);
      if (!approved) {
        run.stages[4]!.state = 'declined';
        run.stages[5]!.state = 'declined';
      } else run.stages[4]!.state = 'waiting';
      run.updatedAt = new Date().toISOString();
      await this.persist(run);
      return run;
    });
  }
  async select(id: string, selectedIds: unknown): Promise<ProfilePlanningRun> {
    if (
      !Array.isArray(selectedIds) ||
      !selectedIds.length ||
      selectedIds.length > 4 ||
      !selectedIds.every((v) => typeof v === 'string') ||
      new Set(selectedIds).size !== selectedIds.length
    )
      throw Error('Choose one or more distinct proposal IDs');
    return this.serialized(async () => {
      const run = await this.get(id);
      if (!run) throw Error('Optimization run not found');
      if (run.state !== 'selection-needed') throw Error('Selection requires explicit prior approval');
      if (selectedIds.some((v) => !run.proposals.some((p) => p.id === v)))
        throw Error('Unknown proposal ID');
      const evidence = sourceEvidence(run);
      if (JSON.stringify(record(run.stages[2]?.output).items) !== JSON.stringify(run.proposals))
        throw Error('Selected proposals differ from reviewed planning evidence');
      const decision = record(run.stages[3]?.output);
      // Historical records created before the versioned approval contract are
      // accepted only in their already-approved selection state.
      const legacyApproved =
        record(run.stages[0]?.output).evidenceRef === undefined &&
        decision.schema === undefined &&
        decision.approved === true &&
        run.stages[3]?.state === 'completed';
      if (!isApprovalFor(decision, evidence) && !legacyApproved)
        throw Error('Selection requires approval of this exact evidence snapshot');
      const selected = run.proposals.filter((p) => selectedIds.includes(p.id));
      run.stages[4]!.state = 'completed';
      run.stages[4]!.output = { selectedIds: selected.map((p) => p.id) };
      const report: PlanningReport = {
        planningOnly: true,
        websiteActionsExecuted: false,
        modelConnected: false,
        approvedIds: selected.map((p) => p.id),
        proposedChanges: selected,
        outstanding: [
          'Compare every proposal against the live LinkedIn section before making changes.',
          'Confirm employment dates, ownership and any disputed professional claims with the account owner.',
          'Check account permissions and obtain separate approval before any external website mutation.',
        ],
        notice:
          'This report is an approved planning document only. It does not verify LinkedIn edits, publish content, or imply that an AI model was connected.',
      };
      run.stages[5]!.state = 'completed';
      run.stages[5]!.output = report;
      run.report = report;
      run.state = 'completed';
      run.updatedAt = new Date().toISOString();
      await this.persist(run);
      return run;
    });
  }
}
