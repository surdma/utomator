import type { Action, Platform } from './types.js';

export type StepKind =
  | 'start'
  | 'session'
  | 'inspect'
  | 'action'
  | 'verify'
  | 'note'
  | 'delay'
  | 'assess'
  | 'evidence'
  | 'approve'
  | 'pause'
  | 'stop'
  | 'finish';
export type StepInputBinding = {
  stepId: string;
  field:
    | 'url'
    | 'excerpt'
    | 'status'
    | 'message'
    | 'durationMs'
    | 'matched'
    | 'summary'
    | 'digest'
    | 'approved'
    | 'evidenceDigest';
};
export type StepDefinitionRef = { id: string; version: number };
export type WorkflowStep = {
  id: string;
  kind: StepKind;
  title: string;
  message?: string;
  delayMs?: number;
  expectedText?: string;
  inputBindings?: {
    message?: StepInputBinding;
    delayMs?: StepInputBinding;
    text?: StepInputBinding;
    expectedMatch?: StepInputBinding;
    observation?: StepInputBinding;
    evidence?: StepInputBinding;
  };
  definition?: StepDefinitionRef;
  position?: { x: number; y: number };
};
export type WorkflowLink = { source: string; target: string };
export type WorkflowPlan = {
  version: 1;
  platform: Platform;
  action: Action;
  name: string;
  parameters?: Record<string, string>;
  steps: WorkflowStep[];
  links: WorkflowLink[];
};

const actions: Record<Platform, readonly Action[]> = {
  linkedin: [
    'audit',
    'audit-page',
    'edit-profile',
    'add-skill',
    'edit-experience',
    'edit-website',
    'edit-services',
    'add-project',
    'add-featured',
  ],
  x: ['audit', 'audit-page', 'edit-profile', 'compose-post', 'pin-post', 'delete-post', 'upload-banner'],
};
const stepKinds = new Set<StepKind>([
  'start',
  'session',
  'inspect',
  'action',
  'verify',
  'note',
  'delay',
  'assess',
  'evidence',
  'approve',
  'pause',
  'stop',
  'finish',
]);
const required = ['start', 'session', 'action', 'finish'] as const;
const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const allowedParameterKeys = new Set([
  'headline',
  'about',
  'skill',
  'bio',
  'location',
  'website',
  'postText',
  'postUrl',
  'positionId',
  'description',
  'startMonth',
  'startYear',
  'websiteIndex',
  'websiteType',
  'projectName',
  'projectUrl',
  'featuredTitle',
  'bannerPath',
]);

export function defaultPlan(platform: Platform, action: Action, name?: string): WorkflowPlan {
  if (!actions[platform]?.includes(action)) throw Error('Unsupported workflow template for platform');
  const verb =
    action === 'audit' || action === 'audit-page' ? 'Inspect page' : 'Execute approved action';
  const steps: WorkflowStep[] = [
    { id: 'start', kind: 'start', title: 'Start run' },
    { id: 'session', kind: 'session', title: 'Authenticated browser' },
    { id: 'inspect', kind: 'inspect', title: 'Inspect current page' },
    { id: 'action', kind: 'action', title: verb },
    { id: 'verify', kind: 'verify', title: 'Observe final page' },
    { id: 'finish', kind: 'finish', title: 'Final output' },
  ];
  return {
    version: 1,
    platform,
    action,
    name: name || action.replaceAll('-', ' '),
    steps,
    links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
}

export function validatePlan(raw: unknown, platform: Platform, action: Action): WorkflowPlan {
  if (!raw || typeof raw !== 'object') throw Error('Workflow definition is required');
  const plan = raw as Partial<WorkflowPlan>;
  if (
    plan.version !== 1 ||
    plan.platform !== platform ||
    plan.action !== action ||
    !actions[platform]?.includes(action) ||
    typeof plan.name !== 'string' ||
    !plan.name.trim() ||
    plan.name.length > 120
  )
    throw Error('Workflow identity or template mismatch');
  if (
    plan.parameters !== undefined &&
    (!plan.parameters ||
      typeof plan.parameters !== 'object' ||
      Array.isArray(plan.parameters) ||
      Object.keys(plan.parameters).length > 18 ||
      !Object.entries(plan.parameters).every(
        ([key, value]) =>
          allowedParameterKeys.has(key) && typeof value === 'string' && value.length <= 3000,
      ))
  ) {
    throw Error('Invalid saved workflow parameters');
  }
  if (
    !Array.isArray(plan.steps) ||
    plan.steps.length < 4 ||
    plan.steps.length > 24 ||
    !Array.isArray(plan.links) ||
    plan.links.length !== plan.steps.length - 1
  )
    throw Error('A workflow needs 4–24 connected steps and exactly one sequential link per transition');
  if (
    !plan.steps.every(
      (step) =>
        step &&
        typeof step.id === 'string' &&
        idPattern.test(step.id) &&
        stepKinds.has(step.kind) &&
        typeof step.title === 'string' &&
        step.title.trim().length > 0 &&
        step.title.length <= 100 &&
        (step.message === undefined ||
          (typeof step.message === 'string' && step.message.length <= 600)) &&
        (step.delayMs === undefined ||
          (Number.isInteger(step.delayMs) && step.delayMs >= 0 && step.delayMs <= 30000)) &&
        (step.expectedText === undefined ||
          (step.kind === 'assess' &&
            typeof step.expectedText === 'string' &&
            step.expectedText.trim().length >= 1 &&
            step.expectedText.length <= 120)) &&
        (step.definition === undefined ||
          (typeof step.definition?.id === 'string' &&
            idPattern.test(step.definition.id) &&
            Number.isSafeInteger(step.definition.version) &&
            step.definition.version >= 1 &&
            step.definition.version <= 100000 &&
            Object.keys(step.definition).length === 2)) &&
        (step.position === undefined ||
          (typeof step.position?.x === 'number' &&
            typeof step.position?.y === 'number' &&
            Number.isFinite(step.position.x) &&
            Number.isFinite(step.position.y) &&
            Math.abs(step.position.x) <= 20000 &&
            Math.abs(step.position.y) <= 20000)),
    )
  )
    throw Error('Invalid workflow step type, title, message or delay');
  const steps = plan.steps;
  const byId = new Map(steps.map((step) => [step.id, step]));
  if (byId.size !== steps.length) throw Error('Duplicate workflow node identifiers');
  for (const kind of required) {
    if (
      steps.filter((s) => s.kind === kind).length !== 1 ||
      !steps.some((s) => s.id === kind && s.kind === kind)
    )
      throw Error('Required workflow stage cannot be removed, renamed or duplicated: ' + kind);
  }
  if (
    steps.some(
      (s) =>
        !required.includes(s.kind as (typeof required)[number]) &&
        required.includes(s.id as (typeof required)[number]),
    )
  )
    throw Error('Reserved node identifier');
  if (
    !plan.links.every(
      (link) =>
        link &&
        typeof link.source === 'string' &&
        typeof link.target === 'string' &&
        byId.has(link.source) &&
        byId.has(link.target) &&
        link.source !== link.target,
    )
  )
    throw Error('Invalid workflow connector');
  const out = new Map<string, string>(),
    inbound = new Map<string, string>();
  for (const link of plan.links) {
    if (out.has(link.source) || inbound.has(link.target))
      throw Error(
        'Branching or merging is not yet supported; every stage must have one ordered successor',
      );
    out.set(link.source, link.target);
    inbound.set(link.target, link.source);
  }
  if (inbound.has('start') || out.has('finish')) throw Error('Start and output are terminal stages');
  const ordered: WorkflowStep[] = [],
    seen = new Set<string>();
  let node: string | undefined = 'start';
  while (node) {
    if (seen.has(node)) throw Error('Workflow has a cycle');
    seen.add(node);
    ordered.push(byId.get(node)!);
    node = out.get(node);
  }
  if (
    seen.size !== steps.length ||
    ordered.at(-1)?.id !== 'finish' ||
    ordered[1]?.id !== 'session' ||
    ordered.indexOf(byId.get('action')!) < 2
  )
    throw Error('All nodes must connect from Start through Browser and Action to Final output');
  // Static binding contracts: allow read-only observation and audited local step
  // results, but never bind dynamically into provider mutation arguments.
  const indices = new Map(ordered.map((step, index) => [step.id, index]));
  const sourceFields: Record<StepKind, Record<string, 'string' | 'number' | 'boolean'>> = {
    start: { status: 'string' },
    session: { status: 'string' },
    inspect: { url: 'string', excerpt: 'string' },
    verify: { url: 'string', excerpt: 'string' },
    action: { status: 'string' },
    note: { status: 'string', message: 'string' },
    delay: { status: 'string', durationMs: 'number' },
    assess: { matched: 'boolean', summary: 'string' },
    evidence: { digest: 'string', url: 'string' },
    approve: { approved: 'boolean', evidenceDigest: 'string' },
    pause: { status: 'string' },
    stop: { status: 'string' },
    finish: { status: 'string' },
  };
  for (const step of ordered) {
    if (step.inputBindings === undefined) continue;
    const bindings = step.inputBindings;
    if (
      !bindings ||
      typeof bindings !== 'object' ||
      Array.isArray(bindings) ||
      Object.keys(bindings).length < 1 ||
      Object.keys(bindings).some(
        (key) =>
          !['message', 'delayMs', 'text', 'expectedMatch', 'observation', 'evidence'].includes(key),
      ) ||
      (step.kind !== 'note' &&
        step.kind !== 'delay' &&
        step.kind !== 'assess' &&
        step.kind !== 'evidence' &&
        step.kind !== 'approve') ||
      (step.kind === 'note' && Object.keys(bindings).some((key) => key !== 'message')) ||
      (step.kind === 'delay' && Object.keys(bindings).some((key) => key !== 'delayMs')) ||
      (step.kind === 'assess' &&
        (!bindings.text ||
          Object.keys(bindings).some((key) => key !== 'text' && key !== 'expectedMatch'))) ||
      (step.kind === 'evidence' &&
        (!bindings.observation || Object.keys(bindings).some((key) => key !== 'observation'))) ||
      (step.kind === 'approve' &&
        (!bindings.evidence || Object.keys(bindings).some((key) => key !== 'evidence')))
    )
      throw Error('Unsupported workflow input binding');
    for (const [target, reference] of Object.entries(bindings)) {
      if (
        !reference ||
        typeof reference.stepId !== 'string' ||
        typeof reference.field !== 'string' ||
        Object.keys(reference).length !== 2
      )
        throw Error('Invalid workflow input reference');
      const source = byId.get(reference.stepId);
      if (!source || (indices.get(source.id) ?? Infinity) >= (indices.get(step.id) ?? -1))
        throw Error('Workflow input must reference an earlier page observation or typed step result');
      if (
        target === 'observation' &&
        (!['inspect', 'verify'].includes(source.kind) || reference.field !== 'excerpt')
      )
        throw Error('Evidence must reference an earlier page observation excerpt');
      if (target === 'evidence' && (source.kind !== 'evidence' || reference.field !== 'digest'))
        throw Error('Approval must reference an earlier evidence digest');
      const actualType = sourceFields[source.kind][reference.field];
      const expectedType =
        target === 'delayMs' ? 'number' : target === 'expectedMatch' ? 'boolean' : 'string';
      if (actualType !== expectedType) throw Error('Workflow input/output type mismatch');
    }
  }
  // Browser mutations still enforce their own authentication, owner checks,
  // human approvals and read-back validation regardless of UI topology.
  return {
    version: 1,
    platform,
    action,
    name: plan.name.trim(),
    ...(plan.parameters ? { parameters: { ...plan.parameters } } : {}),
    steps: ordered.map((step) => ({
      id: step.id,
      kind: step.kind,
      title: step.title,
      ...(step.message === undefined ? {} : { message: step.message }),
      ...(step.delayMs === undefined ? {} : { delayMs: step.delayMs }),
      ...(step.expectedText === undefined ? {} : { expectedText: step.expectedText }),
      ...(step.inputBindings === undefined
        ? {}
        : {
            inputBindings: Object.fromEntries(
              Object.entries(step.inputBindings).map(([key, ref]) => [key, { ...ref }]),
            ),
          }),
      ...(step.definition === undefined ? {} : { definition: { ...step.definition } }),
      ...(step.position === undefined ? {} : { position: { ...step.position } }),
    })),
    links: ordered.slice(1).map((step, index) => ({ source: ordered[index]!.id, target: step.id })),
  };
}

/** Specific, operator-reviewed workflows. The registered provider handler remains
 * responsible for owner verification, action approval, and post-save checks.
 * Planned external research, jobs, messaging and publishing are NOT action steps.
 */
const linkedinPipelineDetails: Partial<
  Record<
    Action,
    {
      name: string;
      actionTitle: string;
      preparation: string;
      result: string;
    }
  >
> = {
  audit: {
    name: 'Profile baseline and evidence',
    actionTitle: 'Record live profile baseline',
    preparation:
      'Inspect the owner profile without modifying it; preserve provenance for later evaluation',
    result: 'Profile audit recorded',
  },
  'audit-page': {
    name: 'Section-specific profile audit',
    actionTitle: 'Inspect the selected page',
    preparation:
      'Verify the exact account, approved page URL and section scope before collecting evidence',
    result: 'Section audit recorded',
  },
  'edit-profile': {
    name: 'Headline and About revision',
    actionTitle: 'Revise approved headline or About',
    preparation:
      'Check owner-provided facts, audience, keywords and approved replacement text before continuing',
    result: 'Headline or About read-back',
  },
  'add-skill': {
    name: 'Skills alignment',
    actionTitle: 'Add an evidence-backed skill',
    preparation:
      'Only add a verified skill that describes real experience and matches the intended professional role',
    result: 'Exact skill read-back',
  },
  'edit-experience': {
    name: 'Experience impact revision',
    actionTitle: 'Revise the selected experience',
    preparation:
      'Confirm position identity, dates, responsibility, achievements and evidence before changing the description',
    result: 'Experience read-back',
  },
  'edit-website': {
    name: 'Contact and website correction',
    actionTitle: 'Update an authorized website',
    preparation: 'Verify the HTTPS URL and contact row index before changing the owned profile',
    result: 'Contact URL read-back',
  },
  'edit-services': {
    name: 'Services positioning',
    actionTitle: 'Revise the Services description',
    preparation: 'Review service offer, intended client, proof and factual claims before saving',
    result: 'Service description read-back',
  },
  'add-project': {
    name: 'Project portfolio showcase',
    actionTitle: 'Add an evidenced project',
    preparation:
      'Confirm the project name, true contribution, URL and owner permission before publishing',
    result: 'Project and evidence link read-back',
  },
  'add-featured': {
    name: 'Featured proof-of-work link',
    actionTitle: 'Add a verified Featured item',
    preparation: 'Verify the Featured URL, title, ownership and relevance to the profile objective',
    result: 'Featured item read-back',
  },
};

export function linkedinPipeline(action: Action): WorkflowPlan {
  const details = linkedinPipelineDetails[action];
  if (!details) throw Error('No verified LinkedIn pipeline for action: ' + action);
  const selectedPage = action === 'audit-page';
  const steps: WorkflowStep[] = [
    { id: 'start', kind: 'start', title: 'Confirm selected account and goal' },
    {
      id: 'session',
      kind: 'session',
      title: 'Verify selected LinkedIn session',
    },
    ...(!selectedPage
      ? ([
          {
            id: 'inspect',
            kind: 'inspect',
            title: 'Review current LinkedIn profile',
          },
          {
            id: 'baseline',
            kind: 'evidence',
            title: 'Record supporting evidence',
            inputBindings: {
              observation: { stepId: 'inspect', field: 'excerpt' },
            },
          },
          {
            id: 'approval',
            kind: 'approve',
            title: 'Review profile evidence',
            inputBindings: {
              evidence: { stepId: 'baseline', field: 'digest' },
            },
          },
        ] satisfies WorkflowStep[])
      : []),
    {
      id: 'prepare',
      kind: 'note',
      title: 'Confirm verified task input',
      message: details.preparation,
    },
    {
      id: 'checkpoint',
      kind: 'pause',
      title: 'Wait for explicit operator review',
    },
    { id: 'action', kind: 'action', title: details.actionTitle },
    { id: 'verify', kind: 'verify', title: 'Verify result on LinkedIn' },
    ...(selectedPage
      ? ([
          {
            id: 'sectionEvidence',
            kind: 'evidence',
            title: 'Record section evidence',
            inputBindings: {
              observation: { stepId: 'verify', field: 'excerpt' },
            },
          },
          {
            id: 'sectionApproval',
            kind: 'approve',
            title: 'Review section evidence',
            inputBindings: {
              evidence: { stepId: 'sectionEvidence', field: 'digest' },
            },
          },
        ] satisfies WorkflowStep[])
      : []),
    {
      id: 'outcome',
      kind: 'note',
      title: details.result,
      inputBindings: { message: { stepId: 'verify', field: 'excerpt' } },
    },
    { id: 'finish', kind: 'finish', title: 'Save results and review receipts' },
  ];
  const plan: WorkflowPlan = {
    version: 1,
    platform: 'linkedin',
    action,
    name: details.name,
    steps,
    links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
  };
  return validatePlan(plan, 'linkedin', action);
}

export function templates(platform: Platform): WorkflowPlan[] {
  return platform === 'linkedin'
    ? actions.linkedin.map(linkedinPipeline)
    : actions[platform].map((action) => defaultPlan(platform, action));
}
