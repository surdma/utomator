import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRestrictedYaml } from '../core/step-definitions.js';
import { linkedinPipeline } from '../core/workflow-plan.js';
import { compileWorkflow } from '../core/workflow-yaml.js';
import type { Action } from '../core/types.js';

/** YAML program inspection is read-only. Executions retain /runs ownership, approval and verification. */
export const linkedInProfileActions = [
  'audit',
  'audit-page',
  'edit-profile',
  'add-skill',
  'edit-experience',
  'edit-website',
  'edit-services',
  'add-project',
  'add-featured',
] as const satisfies readonly Action[];

const file = fileURLToPath(new URL('../../growth/profile-workflow.yaml', import.meta.url));
const plain = (input: unknown): input is Record<string, unknown> =>
  Boolean(input) &&
  typeof input === 'object' &&
  !Array.isArray(input) &&
  Object.getPrototypeOf(input) === Object.prototype;
function fields(
  input: unknown,
  expected: readonly string[],
  label: string,
): asserts input is Record<string, unknown> {
  if (
    !plain(input) ||
    Object.keys(input).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(input, key))
  )
    throw Error(`Invalid Growth profile YAML ${label}`);
}
function entries(input: unknown, prefix: 'requirement' | '', min: number, max: number, label: string) {
  if (
    !plain(input) ||
    Object.keys(input).length < min ||
    Object.keys(input).length > max ||
    !Object.entries(input).every(
      ([key, value]) =>
        (prefix === 'requirement'
          ? /^requirement[0-9]{2}$/.test(key)
          : /^[a-z][a-zA-Z0-9]*$/.test(key)) &&
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 400,
    )
  )
    throw Error(`Invalid Growth profile YAML ${label}`);
  return Object.entries(input) as Array<[string, string]>;
}

/**
 * Design-only Growth blueprints are intentionally not dispatched to Runner.
 * Each stage has a typed, ordered set of procedures, owner tasks and events.
 */
function compileGrowthBlueprintYaml(parsed: Record<string, unknown>) {
  fields(parsed.metadata, ['id', 'version', 'title'], 'blueprint metadata');
  fields(parsed.spec, ['platform', 'objective', 'requirements', 'coverage', 'pipelines'], 'blueprint spec');
  const metadata = parsed.metadata;
  const spec = parsed.spec;
  if (
    parsed.apiVersion !== 'utomator.dev/v1' ||
    parsed.kind !== 'GrowthBlueprintWorkflow' ||
    typeof metadata.id !== 'string' ||
    !/^linkedin-[a-z][a-z0-9-]{2,60}$/.test(metadata.id) ||
    !Number.isSafeInteger(metadata.version) ||
    (metadata.version as number) < 1 ||
    typeof metadata.title !== 'string' ||
    !metadata.title.trim() ||
    metadata.title.length > 120 ||
    spec.platform !== 'linkedin' ||
    typeof spec.objective !== 'string' ||
    !spec.objective.trim() ||
    spec.objective.length > 300
  ) throw Error('Invalid Growth blueprint identity');

  const requirements = entries(spec.requirements, 'requirement', 1, 32, 'blueprint requirements');
  const coverage = entries(spec.coverage, '', 1, 64, 'blueprint coverage');
  if (!plain(spec.pipelines) || Object.keys(spec.pipelines).length < 1 ||
    Object.keys(spec.pipelines).length > 8) {
    throw Error('Growth blueprint requires 1–8 ordered pipelines');
  }
  const keys = Object.keys(spec.pipelines);
  const taskKinds = ['todo', 'procedure', 'action', 'event', 'verify'] as const;
  const stages = keys.map((id, index) => {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) throw Error('Invalid Growth blueprint pipeline ID');
    const raw = spec.pipelines[id];
    fields(raw, ['title', 'dependsOn', 'tasks'], 'blueprint pipeline');
    fields(raw.tasks, taskKinds, 'blueprint task types');
    if (
      typeof raw.title !== 'string' ||
      !raw.title.trim() || raw.title.length > 120 ||
      raw.dependsOn !== (index === 0 ? 'none' : keys[index - 1]) ||
      taskKinds.some((kind) => typeof raw.tasks[kind] !== 'string' ||
        !(raw.tasks[kind] as string).trim() || (raw.tasks[kind] as string).length > 200)
    ) throw Error('Invalid Growth blueprint pipeline or task');
    const steps = taskKinds.map((kind) => ({
      id: kind,
      kind: kind === 'procedure' ? 'assess' as const : kind === 'verify' ? 'verify' as const : 'note' as const,
      title: raw.tasks[kind] as string,
      message: kind + ' · Owner-operated planning step; not a provider command',
    }));
    const plan = {
      version: 1 as const,
      platform: 'linkedin' as const,
      action: 'manual-review',
      name: raw.title as string,
      steps,
      links: steps.slice(1).map((step, i) => ({ source: steps[i]!.id, target: step.id })),
    };
    return {
      id,
      title: raw.title as string,
      action: 'manual' as const,
      page: 'none' as const,
      dependsOn: raw.dependsOn as string,
      sectionIds: coverage.map(([sectionId]) => sectionId),
      stepCount: steps.length,
      plan,
      execution: 'design-only' as const,
      evidenceMode: 'owner-review-required' as const,
    };
  });
  return {
    apiVersion: 'utomator.dev/v1' as const,
    kind: 'GrowthBlueprintWorkflow' as const,
    id: metadata.id as string,
    version: metadata.version as number,
    title: metadata.title as string,
    objective: spec.objective as string,
    requirements: requirements.map(([id, text]) => ({ id, text })),
    coverage: coverage.map(([id, label]) => ({
      id, label, status: 'requires-independent-evidence' as const,
    })),
    pipelines: stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      action: 'manual',
      stepCount: stage.stepCount,
      source: 'design-only' as const,
      requiresConnectedAccount: false as const,
      executionEndpoint: null,
    })),
    stages,
    executable: false as const,
    execution: 'design-only' as const,
    limitation: 'This YAML defines planned or owner-operated procedures. No unsupported provider action or automated outcome is available.',
  };
}

export function compileGrowthProfileYaml(yaml: string) {
  const parsed = parseRestrictedYaml(yaml);
  fields(parsed, ['apiVersion', 'kind', 'metadata', 'spec'], 'root');
  if (parsed.kind === 'GrowthBlueprintWorkflow') return compileGrowthBlueprintYaml(parsed);
  fields(parsed.metadata, ['id', 'version', 'title'], 'metadata');
  fields(
    parsed.spec,
    ['platform', 'objective', 'requirements', 'coverage', 'pipelines', 'stages'],
    'spec',
  );
  const metadata = parsed.metadata,
    spec = parsed.spec;
  if (
    parsed.apiVersion !== 'utomator.dev/v1' ||
    !['GrowthProfileWorkflow', 'GrowthWorkflow'].includes(String(parsed.kind)) ||
    typeof metadata.id !== 'string' ||
    !/^[a-z][a-z0-9-]{2,70}$/.test(metadata.id) ||
    !Number.isSafeInteger(metadata.version) ||
    (metadata.version as number) < 1 ||
    typeof metadata.title !== 'string' ||
    !metadata.title.trim() ||
    metadata.title.length > 120 ||
    spec.platform !== 'linkedin' ||
    typeof spec.objective !== 'string' ||
    !spec.objective.trim() ||
    spec.objective.length > 300
  )
    throw Error('Invalid Growth profile YAML identity');
  const requirements = entries(spec.requirements, 'requirement', 1, 32, 'requirements');
  const coverage = entries(spec.coverage, '', 1, 64, 'coverage');
  const pipelines = entries(spec.pipelines, '', 1, 24, 'pipelines');
  if (
    metadata.id === 'linkedin-profile' &&
    (requirements.length !== 9 || coverage.length !== 20 || pipelines.length !== 9)
  )
    throw Error('Default Growth profile requirements, coverage or actions changed unexpectedly');
  const rawStages = spec.stages;
  if (
    !plain(rawStages) ||
    Object.keys(rawStages).length < 1 ||
    Object.keys(rawStages).length > 24 ||
    (metadata.id === 'linkedin-profile' && Object.keys(rawStages).length !== 6)
  )
    throw Error('Growth template requires 1–24 ordered pipeline stages');
  const seenSections = new Set<string>();
  const stageKeys = Object.keys(rawStages);
  const registeredSections = new Set(coverage.map(([id]) => id));
  const stages = stageKeys.map((id, index) => {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) throw Error('Invalid Growth pipeline stage ID');
    const raw = rawStages[id];
    fields(raw, ['title', 'action', 'page', 'sections', 'dependsOn', 'tasks'], 'stage');
    if (
      typeof raw.title !== 'string' ||
      !raw.title.trim() ||
      raw.title.length > 120 ||
      !['audit', 'audit-page'].includes(String(raw.action)) ||
      !['profile', 'experience', 'skills', 'projects', 'featured'].includes(String(raw.page)) ||
      (raw.action === 'audit-page' && raw.page === 'profile') ||
      (raw.action === 'audit' && raw.page !== 'profile') ||
      raw.dependsOn !== (index === 0 ? 'none' : stageKeys[index - 1]) ||
      typeof raw.sections !== 'string'
    )
      throw Error('Invalid or unsafe Growth pipeline stage configuration');
    const sectionIds =
      raw.sections === '*'
        ? coverage.map(([section]) => section)
        : raw.sections.split(',').map((section) => section.trim());
    if (
      !sectionIds.length ||
      new Set(sectionIds).size !== sectionIds.length ||
      sectionIds.some((section) => !registeredSections.has(section))
    )
      throw Error('Invalid Growth stage section assignment');
    const isFinalStage = index === stageKeys.length - 1;
    if (
      isFinalStage &&
      metadata.id === 'linkedin-profile' &&
      (raw.sections !== '*' || sectionIds.length !== 20)
    )
      throw Error('Default profile final review must include all 20 evidence targets');
    if (isFinalStage && raw.sections === '*' && index > 0) {
      // A final review can repeat prior coverage, but cannot hide omitted sections.
      if (seenSections.size !== registeredSections.size)
        throw Error('Final Growth review requires coverage in preceding pipelines');
    } else {
      // A single-pipeline Growth may cover all its evidence requirements.
      for (const section of sectionIds) {
        if (seenSections.has(section)) throw Error('Growth profile coverage assigned twice');
        seenSections.add(section);
      }
    }
    // This is an executable Runner workflow; the section assignments are
    // independent evidence requirements, not invented browser extractors.
    const action = raw.action as 'audit' | 'audit-page';
    const base = linkedinPipeline(action);
    const taskOverrides = raw.tasks;
    if (
      !plain(taskOverrides) ||
      !['start', 'session', 'action'].every(
        (key) => typeof taskOverrides[key] === 'string' && taskOverrides[key].trim(),
      ) ||
      Object.entries(taskOverrides).some(
        ([key, value]) =>
          !base.steps.some((step) => step.id === key) ||
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > 100,
      )
    )
      throw Error('Growth pipeline tasks must match registered Runner task IDs');
    // YAML may refine text for existing reviewed tasks, never alter operation, scope or bindings.
    const plan = {
      ...base,
      steps: base.steps.map((step) => ({
        ...step,
        title:
          typeof taskOverrides[step.id] === 'string' ? (taskOverrides[step.id] as string) : step.title,
      })),
    };
    const compiled = compileWorkflow(plan);
    return {
      id,
      title: raw.title,
      action,
      page: raw.page as 'profile' | 'experience' | 'skills' | 'projects' | 'featured',
      dependsOn: raw.dependsOn as string,
      sectionIds,
      stepCount: compiled.steps.length,
      plan: compiled.plan,
      execution: 'existing-runner' as const,
      evidenceMode: 'independent-unverified-until-sourced' as const,
    };
  });
  if (seenSections.size !== registeredSections.size)
    throw Error('Every Growth coverage item must be assigned to a pipeline');
  const expected = new Set<string>(linkedInProfileActions);
  if (
    new Set(coverage.map(([, label]) => label)).size !== coverage.length ||
    new Set(pipelines.map(([, action]) => action)).size !== pipelines.length ||
    pipelines.some(([, action]) => !expected.has(action))
  )
    throw Error('Growth profile YAML contains missing, duplicated or unregistered coverage/actions');
  const resolved = pipelines.map(([id, action]) => {
    const compiled = compileWorkflow(linkedinPipeline(action as Action));
    return {
      id,
      action,
      title: compiled.plan.name,
      stepCount: compiled.steps.length,
      source: 'registered-workflow-plan' as const,
      requiresConnectedAccount: true as const,
      executionEndpoint: '/runs' as const,
    };
  });
  return {
    apiVersion: 'utomator.dev/v1' as const,
    kind: parsed.kind as 'GrowthProfileWorkflow' | 'GrowthWorkflow',
    id: metadata.id as string,
    version: metadata.version as number,
    title: metadata.title as string,
    objective: spec.objective,
    requirements: requirements.map(([id, text]) => ({ id, text })),
    coverage: coverage.map(([id, label]) => ({
      id,
      label,
      status: 'requires-independent-evidence' as const,
    })),
    pipelines: resolved,
    stages,
    execution:
      metadata.id === 'linkedin-profile'
        ? ('six-dependent-runner-pipelines' as const)
        : ('ordered-runner-pipelines' as const),
    limitation:
      'Reviewed Runner pipelines execute supported actions. Independent section extractors, in-composition edits and verified field-level rubrics are not yet available.',
  };
}
export async function readGrowthProfileWorkflow() {
  const yaml = await readFile(file, 'utf8');
  return { yaml, program: compileGrowthProfileYaml(yaml) };
}

/** Every Growth template is discovered from validated YAML; never add a route per Growth. */
export async function readGrowthTemplateCatalog() {
  const directory = dirname(file);
  const names = (await readdir(directory))
    .filter((name) => /^[a-z][a-z0-9-]*-workflow\.yaml$/.test(name))
    .sort();
  const compiled = await Promise.all(
    names.map(async (name) => {
      const yaml = await readFile(join(directory, name), 'utf8');
      const program = compileGrowthProfileYaml(yaml);
      return { yaml, program };
    }),
  );
  if (new Set(compiled.map((item) => item.program.id)).size !== compiled.length)
    throw Error('Duplicate Growth YAML template IDs');
  return compiled;
}
export async function readGrowthTemplate(id: string) {
  if (!/^[a-z][a-z0-9-]{2,70}$/.test(id)) return null;
  return (await readGrowthTemplateCatalog()).find((item) => item.program.id === id) ?? null;
}
