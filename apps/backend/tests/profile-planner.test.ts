
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import type { CareerDocument } from '../src/profile/career-store.js';
import { ProfilePlanner, planningManifest } from '../src/profile/profile-planner.js';
import { loadIdentityTimeline } from '../src/profile/profile-timeline.js';
import { isApprovalFor, isEvidenceRecord } from '../src/runs/evidence-approval.js';

// main.ts also supports direct server startup. Set test mode before importing it,
// otherwise a stray Fastify listener keeps the unit-test worker running forever.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

const career: CareerDocument = {
  name: 'Alice Example',
  headline: 'Engineering leader',
  location: 'Remote',
  summary: 'Built systems with measured outcomes.',
  contacts: [],
  education: [],
  skills: [],
  customSections: [],
  experience: [
    {
      company: 'Example Co',
      role: 'Engineer',
      period: '2022 to 2024',
      location: 'Remote',
      bullets: ['Improved platform availability.'],
    },
  ],
  projects: [{ title: 'Platform migration', outcome: 'Improved reliability.' }],
};
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const input = {
  accountId: alice,
  profileUrl: 'https://www.linkedin.com/in/alice-example/',
  career,
  careerRevision: 1,
};
test('six YAML planning stages have a stable allowlisted order and typed handoffs', () => {
  const manifest = planningManifest();
  expect(manifest.manifest).toMatch(/kind: "ProfilePlanningWorkflow"/);
  const stages = ['context', 'assessment', 'proposals', 'approval', 'selection', 'report'] as const;
  expect(Object.keys(manifest.steps)).toEqual(stages);
  for (let i = 0; i < stages.length; i++) {
    const yaml = manifest.steps[stages[i]]!;
    expect(yaml).toMatch(/providerMutation: false/);
    expect(yaml).toMatch(/operation: "/);
    expect(yaml).toMatch(new RegExp(`sourceStep: ${i ? `"${stages[i - 1]}"` : 'null'}`));
  }
});

test('full-profile planning uses real owner sources, enforces approval and keeps reports read-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-profile-planner-'));
  try {
    const planner = new ProfilePlanner(root, loadIdentityTimeline);
    const start = await planner.start(input);
    expect(start.state).toEqual('approval-needed');
    expect(start.stages.map((step) => step.id)).toEqual(['context', 'assessment', 'proposals', 'approval', 'selection', 'report']);
    expect(start.proposals.length >= 3).toBeTruthy();
    expect(start.proposals.every((proposal) => proposal.source.startsWith('utomator:career.profile.'))).toBeTruthy();
    expect(start.accountId).toEqual(alice);
    expect(start.source).toEqual('account-career');
    expect(start.proposals.every((proposal) => proposal.status === 'draft-for-review')).toBeTruthy();
    expect(start.report).toEqual(undefined);
    const evidence = (start.stages[0]?.output as { evidenceRef?: unknown } | undefined)?.evidenceRef;
    expect(isEvidenceRecord(evidence)).toBeTruthy();
    expect(evidence.sourceSchema).toEqual('owner-evidence/v1');
    expect(start.profileUrl).toMatch(/linkedin\.com\/in\//);
    expect(start.stages[1]?.output && typeof start.stages[1].output).toEqual('object');
    expect(await readFile(join(root, 'steps', start.id, 'approval.yaml'), 'utf8')).toMatch(/request-owner-approval/);
    await expect((planner.select(start.id, ['headline']))).rejects.toThrow(/requires explicit prior approval/);
    const approved = await planner.decide(start.id, true);
    expect(approved.state).toEqual('selection-needed');
    expect(isApprovalFor(approved.stages[3]?.output, evidence)).toBeTruthy();
    await expect((planner.decide(start.id, true))).rejects.toThrow(/already resolved/);
    await expect((planner.select(start.id, ['unknown']))).rejects.toThrow(/Unknown proposal ID/);
    const selected = await new ProfilePlanner(root, loadIdentityTimeline).select(start.id, [
      start.proposals[0]!.id,
    ]);
    expect(selected.state).toEqual('completed');
    expect(selected.report?.websiteActionsExecuted).toEqual(false);
    expect(selected.report?.modelConnected).toEqual(false);
    expect(selected.report?.planningOnly).toEqual(true);
    expect(selected.report?.proposedChanges.length).toEqual(1);
    expect(selected.report?.notice ?? '').toMatch(/does not verify LinkedIn edits/);
    expect((await new ProfilePlanner(root).get(start.id))?.report?.approvedIds.length).toEqual(1);
    await expect((planner.select(start.id, [start.proposals[0]!.id]))).rejects.toThrow(/requires explicit prior approval/);
    const denied = await planner.start(input);
    const declined = await planner.decide(denied.id, false);
    expect(declined.state).toEqual('declined');
    expect(declined.report).toEqual(undefined);
    await expect((planner.select(denied.id, [denied.proposals[0]!.id]))).rejects.toThrow(/requires explicit prior approval/);
    await expect((planner.get('../escape'))).rejects.toThrow(/Invalid optimization run ID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Fastify refuses portfolio planning without a verified selected account', async () => {
  const app = buildApp();
  try {
    await app.ready();
    expect((await app.inject({ method: 'POST', url: '/profile-plans', payload: {} })).statusCode).toEqual(400);
    const result = await app.inject({
      method: 'POST',
      url: '/profile-plans',
      payload: {
        accountId: '00000000-0000-4000-8000-000000009999',
      },
    });
    expect(result.statusCode).toEqual(422);
    expect(result.json().error).toMatch(/not found|not verified/i);
  } finally {
    await app.close();
  }
});

test('planning report refuses an approval whose persisted evidence digest no longer matches owner facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-planning-integrity-'));
  try {
    const planner = new ProfilePlanner(root, loadIdentityTimeline);
    const start = await planner.start(input);
    await planner.decide(start.id, true);
    const path = join(root, `${start.id}.json`);
    const stored = JSON.parse(await readFile(path, 'utf8')) as {
      stages: Array<{ output?: { evidenceRef?: { digest?: string } } }>;
    };
    const source = stored.stages[0]!.output!.evidenceRef!;
    source.digest = '0'.repeat(64);
    await writeFile(path, JSON.stringify(stored));
    await expect((planner.select(start.id, [start.proposals[0]!.id]))).rejects.toThrow(/evidence reference does not match owner facts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planning different selected accounts does not reuse a fixed LinkedIn handle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-planning-accounts-'));
  try {
    const planner = new ProfilePlanner(root, loadIdentityTimeline);
    const first = await planner.start(input);
    const second = await planner.start({
      ...input,
      accountId: bob,
      profileUrl: 'https://www.linkedin.com/in/bob-example/',
      career: {
        ...career,
        name: 'Bob Example',
        headline: 'Chemistry teacher',
        summary: 'Teaching chemistry.',
      },
    });
    expect(first.profileUrl).toEqual('https://www.linkedin.com/in/alice-example/');
    expect(second.profileUrl).toEqual('https://www.linkedin.com/in/bob-example/');
    expect(second.proposals.find((p) => p.id === 'headline')?.proposed).toEqual('Chemistry teacher');
    await planner.decide(first.id, true);
    const path = join(root, `${first.id}.json`);
    const stored = JSON.parse(await readFile(path, 'utf8')) as {
      accountId?: string;
    };
    stored.accountId = bob;
    await writeFile(path, JSON.stringify(stored));
    await expect((planner.select(first.id, ['headline']))).rejects.toThrow(/another social account/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
