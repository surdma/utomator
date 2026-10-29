import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WorkflowPlan, WorkflowStep, StepKind } from './workflow-plan.js';

export type StepOperation =
  | 'begin'
  | 'reuse-session'
  | 'observe-page'
  | 'execute-approved-action'
  | 'record-event'
  | 'delay'
  | 'assess-observation'
  | 'capture-evidence'
  | 'require-evidence-approval'
  | 'await-operator'
  | 'end-run'
  | 'complete-run';

export const operationFor: Record<StepKind, StepOperation> = {
  start: 'begin',
  session: 'reuse-session',
  inspect: 'observe-page',
  action: 'execute-approved-action',
  verify: 'observe-page',
  note: 'record-event',
  delay: 'delay',
  assess: 'assess-observation',
  evidence: 'capture-evidence',
  approve: 'require-evidence-approval',
  pause: 'await-operator',
  stop: 'end-run',
  finish: 'complete-run',
};
export type OutputSchema =
  | 'status/v1'
  | 'page-observation/v1'
  | 'action-event/v1'
  | 'assessment/v1'
  | 'evidence/v1'
  | 'approval/v1';
export const outputFor = (kind: StepKind): OutputSchema =>
  kind === 'inspect' || kind === 'verify'
    ? 'page-observation/v1'
    : kind === 'action'
      ? 'action-event/v1'
      : kind === 'assess'
        ? 'assessment/v1'
        : kind === 'evidence'
          ? 'evidence/v1'
          : kind === 'approve'
            ? 'approval/v1'
            : 'status/v1';

export interface AuthoredStepDefinition {
  apiVersion: 'utomator.dev/v1';
  kind: 'StepDefinition';
  metadata: { id: string; version: number; title: string };
  spec: {
    stepKind: StepKind;
    operation: StepOperation;
    outputs: OutputSchema;
    config: { message?: string; delayMs?: number; expectedText?: string };
  };
}
const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const maxYamlBytes = 8192;
function plainRecord(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function fields(
  value: unknown,
  accepted: readonly string[],
  required: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (
    !plainRecord(value) ||
    Object.keys(value).some((k) => !accepted.includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    throw Error('Invalid YAML ' + label + ' schema');
}
/** A deliberately restricted YAML 1.2 mapping subset: 2-space nesting, JSON-quoted
 * strings, integer scalars, no aliases/tags/merges/flow objects or executable syntax.
 * JSON-quoted scalars are YAML 1.2 scalars. Unknown keys and duplicate keys fail closed.
 */
export function parseRestrictedYaml(yaml: string): unknown {
  if (
    typeof yaml !== 'string' ||
    Buffer.byteLength(yaml, 'utf8') > maxYamlBytes ||
    !yaml.trim() ||
    yaml.includes('\t') ||
    yaml.includes('\r') ||
    yaml.includes('\0')
  )
    throw Error('Invalid YAML document size or characters');
  const root: Record<string, unknown> = {};
  const parents: Array<{ indent: number; object: Record<string, unknown> }> = [
    { indent: -2, object: root },
  ];
  let previousIndent = -2;
  for (const raw of yaml.split('\n')) {
    if (!raw.trim() || raw.trim() === '---' || raw.trim() === '...') continue;
    const indent = raw.length - raw.trimStart().length;
    if (
      indent % 2 ||
      indent > 8 ||
      indent > previousIndent + 2 ||
      !/^( *)([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/.test(raw)
    )
      throw Error('Unsupported YAML syntax or indentation');
    while (parents.length && parents.at(-1)!.indent >= indent) parents.pop();
    if (!parents.length || parents.at(-1)!.indent !== indent - 2)
      throw Error('Invalid YAML parent indentation');
    const match = raw.match(/^ *([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/)!;
    const key = match[1]!,
      rawValue = match[2];
    const parent = parents.at(-1)!.object;
    if (Object.hasOwn(parent, key)) throw Error('Duplicate YAML key: ' + key);
    if (rawValue === undefined || rawValue === '') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      parents.push({ indent, object: child });
    } else {
      if (
        !/^"(?:\\.|[^"\\])*"$/.test(rawValue) &&
        !/^(0|[1-9][0-9]*)$/.test(rawValue)
      )
        throw Error(
          'YAML scalar must be a JSON-quoted string or unsigned integer'
        );
      parent[key] = rawValue.startsWith('"')
        ? (JSON.parse(rawValue) as unknown)
        : Number(rawValue);
    }
    previousIndent = indent;
  }
  return root;
}
export function parseStepDefinition(yaml: string): AuthoredStepDefinition {
  const raw = parseRestrictedYaml(yaml);
  fields(
    raw,
    ['apiVersion', 'kind', 'metadata', 'spec'],
    ['apiVersion', 'kind', 'metadata', 'spec'],
    'definition'
  );
  fields(
    raw.metadata,
    ['id', 'version', 'title'],
    ['id', 'version', 'title'],
    'metadata'
  );
  fields(
    raw.spec,
    ['stepKind', 'operation', 'outputs', 'config'],
    ['stepKind', 'operation', 'outputs', 'config'],
    'spec'
  );
  fields(raw.spec.config, ['message', 'delayMs', 'expectedText'], [], 'config');
  const meta = raw.metadata,
    spec = raw.spec;
  const config = spec.config as Record<string, unknown>;
  if (
    raw.apiVersion !== 'utomator.dev/v1' ||
    raw.kind !== 'StepDefinition' ||
    typeof meta.id !== 'string' ||
    !idPattern.test(meta.id) ||
    !Number.isSafeInteger(meta.version) ||
    (meta.version as number) < 1 ||
    (meta.version as number) > 100000 ||
    typeof meta.title !== 'string' ||
    !meta.title.trim() ||
    meta.title.length > 100 ||
    typeof spec.stepKind !== 'string' ||
    !Object.hasOwn(operationFor, spec.stepKind) ||
    spec.operation !== operationFor[spec.stepKind as StepKind] ||
    spec.outputs !== outputFor(spec.stepKind as StepKind)
  )
    throw Error('Unregistered or inconsistent YAML step definition');
  if (
    config.message !== undefined &&
    (typeof config.message !== 'string' || config.message.length > 600)
  )
    throw Error('Invalid YAML step message');
  if (
    config.delayMs !== undefined &&
    (!Number.isInteger(config.delayMs) ||
      (config.delayMs as number) < 0 ||
      (config.delayMs as number) > 30000)
  )
    throw Error('Invalid YAML delay');
  if (
    config.expectedText !== undefined &&
    (spec.stepKind !== 'assess' ||
      typeof config.expectedText !== 'string' ||
      !config.expectedText.trim() ||
      config.expectedText.length > 120)
  )
    throw Error('Invalid YAML assessment expectation');
  if (
    config.message !== undefined &&
    !['note', 'stop', 'pause'].includes(spec.stepKind as string)
  )
    throw Error('Message is not configurable for this YAML operation');
  if (config.delayMs !== undefined && spec.stepKind !== 'delay')
    throw Error('Delay is not configurable for this YAML operation');
  return raw as unknown as AuthoredStepDefinition;
}
export function instantiateStep(
  step: WorkflowStep,
  definition: AuthoredStepDefinition
): WorkflowStep {
  if (
    !step.definition ||
    step.definition.id !== definition.metadata.id ||
    step.definition.version !== definition.metadata.version ||
    step.kind !== definition.spec.stepKind
  )
    throw Error('Workflow step and authored YAML definition mismatch');
  return {
    ...step,
    message: step.message ?? definition.spec.config.message,
    delayMs: step.delayMs ?? definition.spec.config.delayMs,
    expectedText: step.expectedText ?? definition.spec.config.expectedText,
  };
}
/** Immutable definition versions: version 1 is created; future versions require the
 * previous version to exist. Workflow references always pin a specific version. */
export class StepDefinitionStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly root = resolve(
      process.cwd(),
      '.runtime',
      'step-definitions'
    )
  ) {}
  private file(id: string, version: number): string {
    if (
      !idPattern.test(id) ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      version > 100000
    )
      throw Error('Invalid step definition reference');
    return resolve(this.root, id, version + '.yaml');
  }
  get(id: string, version: number): Promise<AuthoredStepDefinition | null> {
    const path = this.file(id, version);
    return readFile(path, 'utf8').then(
      (content) => parseStepDefinition(content),
      (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    );
  }
  async create(yaml: string): Promise<AuthoredStepDefinition> {
    const definition = parseStepDefinition(yaml);
    const operation = this.queue.then(async () => {
      const { id, version } = definition.metadata;
      if (version > 1 && !(await this.get(id, version - 1)))
        throw Error('Previous definition version missing');
      await mkdir(resolve(this.root, id), { recursive: true, mode: 0o700 });
      await writeFile(
        this.file(id, version),
        yaml.endsWith('\n') ? yaml : yaml + '\n',
        {
          flag: 'wx',
          mode: 0o600,
        }
      );
      return definition;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async resolve(
    plan: WorkflowPlan
  ): Promise<Map<string, AuthoredStepDefinition>> {
    const resolved = new Map<string, AuthoredStepDefinition>();
    for (const step of plan.steps) {
      if (!step.definition) continue;
      const definition = await this.get(
        step.definition.id,
        step.definition.version
      );
      if (!definition)
        throw Error(
          'Authored YAML step definition not found: ' + step.definition.id
        );
      instantiateStep(step, definition);
      resolved.set(step.id, definition);
    }
    return resolved;
  }
  async list(): Promise<AuthoredStepDefinition[]> {
    let folders: string[];
    try {
      folders = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const definitions: AuthoredStepDefinition[] = [];
    for (const name of folders) {
      if (!idPattern.test(name)) continue;
      const versions = await readdir(resolve(this.root, name));
      for (const file of versions) {
        if (!/^[1-9][0-9]*\.yaml$/.test(file)) continue;
        const entry = await this.get(name, Number(file.slice(0, -5)));
        if (entry) definitions.push(entry);
      }
    }
    return definitions.sort(
      (a, b) =>
        a.metadata.id.localeCompare(b.metadata.id) ||
        a.metadata.version - b.metadata.version
    );
  }
}
