import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRestrictedYaml } from '../core/step-definitions.js';
import { linkedinPipeline } from '../core/workflow-plan.js';
import { compileWorkflow } from '../core/workflow-yaml.js';
import type { Action } from '../core/types.js';

/** YAML program inspection is read-only. Executions retain /runs ownership, approval and verification. */
export const linkedInProfileActions = [
  'audit', 'audit-page', 'edit-profile', 'add-skill', 'edit-experience',
  'edit-website', 'edit-services', 'add-project', 'add-featured',
] as const satisfies readonly Action[];

const file = fileURLToPath(new URL('../../growth/profile-workflow.yaml', import.meta.url));
const plain = (input: unknown): input is Record<string, unknown> =>
  Boolean(input) && typeof input === 'object' && !Array.isArray(input) &&
  Object.getPrototypeOf(input) === Object.prototype;
function fields(input: unknown, expected: readonly string[], label: string):
  asserts input is Record<string, unknown> {
  if (!plain(input) || Object.keys(input).length !== expected.length ||
    expected.some(key => !Object.hasOwn(input, key)))
    throw Error('Invalid Growth profile YAML ' + label);
}
function entries(input: unknown, prefix: 'requirement' | '', count: number, label: string) {
  if (!plain(input) || Object.keys(input).length !== count ||
      !Object.entries(input).every(([key, value]) =>
        (prefix === 'requirement' ? /^requirement[0-9]{2}$/.test(key) : /^[a-z][a-zA-Z0-9]*$/.test(key)) &&
        typeof value === 'string' && value.trim().length > 0 && value.length <= 400))
    throw Error('Invalid Growth profile YAML ' + label);
  return Object.entries(input) as Array<[string, string]>;
}
export function compileGrowthProfileYaml(yaml: string) {
  const parsed = parseRestrictedYaml(yaml);
  fields(parsed, ['apiVersion', 'kind', 'metadata', 'spec'], 'root');
  fields(parsed.metadata, ['id', 'version', 'title'], 'metadata');
  fields(parsed.spec, ['platform', 'objective', 'requirements', 'coverage', 'pipelines', 'stages'], 'spec');
  const metadata = parsed.metadata, spec = parsed.spec;
  if (parsed.apiVersion !== 'utomator.dev/v1' ||
      parsed.kind !== 'GrowthProfileWorkflow' || metadata.id !== 'linkedin-profile' ||
      metadata.version !== 1 || metadata.title !== 'Profile auditing & section optimization' ||
      spec.platform !== 'linkedin' || typeof spec.objective !== 'string' ||
      !spec.objective.trim() || spec.objective.length > 300)
    throw Error('Invalid Growth profile YAML identity');
  const requirements = entries(spec.requirements, 'requirement', 9, 'requirements');
  const coverage = entries(spec.coverage, '', 20, 'coverage');
  const pipelines = entries(spec.pipelines, '', 9, 'pipelines');
  const rawStages = spec.stages;
  if (!plain(rawStages) || Object.keys(rawStages).length !== 6)
    throw Error('Growth profile requires exactly six ordered pipeline stages');
  const seenSections = new Set<string>();
  const stageKeys = Object.keys(rawStages);
  const registeredSections = new Set(coverage.map(([id]) => id));
  const stages = stageKeys.map((id, index) => {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) throw Error('Invalid Growth pipeline stage ID');
    const raw = rawStages[id];
    fields(raw, ['title', 'action', 'page', 'sections', 'dependsOn'], 'stage');
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 120 ||
        !['audit', 'audit-page'].includes(String(raw.action)) ||
        !['profile', 'experience', 'skills', 'projects', 'featured'].includes(String(raw.page)) ||
        (raw.action === 'audit-page' && raw.page === 'profile') ||
        (raw.action === 'audit' && raw.page !== 'profile') ||
        raw.dependsOn !== (index === 0 ? 'none' : stageKeys[index - 1]) ||
        typeof raw.sections !== 'string')
      throw Error('Invalid or unsafe Growth pipeline stage configuration');
    const sectionIds = raw.sections === '*' ? coverage.map(([section]) => section) :
      raw.sections.split(',').map(section => section.trim());
    if (!sectionIds.length || new Set(sectionIds).size !== sectionIds.length ||
        sectionIds.some(section => !registeredSections.has(section)))
      throw Error('Invalid Growth stage section assignment');
    if (index < stageKeys.length - 1) {
      for (const section of sectionIds) {
        if (seenSections.has(section)) throw Error('Growth profile coverage assigned twice');
        seenSections.add(section);
      }
    } else if (raw.sections !== '*' || sectionIds.length !== 20) {
      throw Error('Final review must include all 20 evidence targets');
    }
    // This is an executable Runner workflow; the section assignments are
    // independent evidence requirements, not invented browser extractors.
    const action = raw.action as 'audit' | 'audit-page';
    const compiled = compileWorkflow(linkedinPipeline(action));
    return {
      id, title: raw.title, action, page: raw.page as
        'profile' | 'experience' | 'skills' | 'projects' | 'featured',
      dependsOn: raw.dependsOn as string, sectionIds,
      stepCount: compiled.steps.length,
      execution: 'existing-runner' as const,
      evidenceMode: 'independent-unverified-until-sourced' as const,
    };
  });
  if (seenSections.size !== registeredSections.size)
    throw Error('Every profile section must be assigned to one assessment stage');
  const expected = new Set<string>(linkedInProfileActions);
  if (new Set(coverage.map(([, label]) => label)).size !== 20 ||
      new Set(pipelines.map(([, action]) => action)).size !== linkedInProfileActions.length ||
      pipelines.some(([, action]) => !expected.has(action)))
    throw Error('Growth profile YAML contains missing, duplicated or unregistered coverage/actions');
  const resolved = pipelines.map(([id, action]) => {
    const compiled = compileWorkflow(linkedinPipeline(action as Action));
    return { id, action, title: compiled.plan.name, stepCount: compiled.steps.length,
      source: 'registered-workflow-plan' as const, requiresConnectedAccount: true as const,
      executionEndpoint: '/runs' as const };
  });
  return {
    apiVersion: 'utomator.dev/v1' as const, kind: 'GrowthProfileWorkflow' as const,
    id: metadata.id as string, version: metadata.version as number,
    title: metadata.title as string, objective: spec.objective,
    requirements: requirements.map(([id, text]) => ({ id, text })),
    coverage: coverage.map(([id, label]) => ({
      id, label, status: 'requires-independent-evidence' as const,
    })),
    pipelines: resolved,
    stages,
    execution: 'six-dependent-runner-pipelines' as const,
    limitation: 'Six dependent read-only Runner workflows coordinate stage evidence and approvals. Individual profile-section extractors, in-composition edits, and independently verified field rubrics are not available yet.',
  };
}
export async function readGrowthProfileWorkflow() {
  const yaml = await readFile(file, 'utf8');
  return { yaml, program: compileGrowthProfileYaml(yaml) };
}
