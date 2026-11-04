import { createHash } from 'node:crypto';
import {
  type AuthoredStepDefinition,
  instantiateStep,
  type OutputSchema,
  operationFor,
  outputFor,
  type StepOperation,
} from './step-definitions.js';
import type { StepInputBinding, WorkflowPlan, WorkflowStep } from './workflow-plan.js';
import { validatePlan } from './workflow-plan.js';

/**
 * A trusted, schema-validated YAML execution document. The only possible
 * operations come from the reviewed registry below. Root-level accessibility
 * snapshots and uploaded user/LLM YAML are not executable documents.
 */
export interface StepDocument {
  apiVersion: 'utomator.dev/v1';
  kind: 'SocialStep';
  metadata: {
    id: string;
    title: string;
    workflow: string;
    platform: 'linkedin' | 'x';
    definitionId?: string;
    definitionVersion?: number;
  };
  spec: {
    operation: StepOperation;
    inputs: {
      from: string | null;
      scope: 'current-run';
      bindings?: {
        message?: StepInputBinding & { schema: OutputSchema };
        delayMs?: StepInputBinding & { schema: OutputSchema };
        text?: StepInputBinding & { schema: OutputSchema };
        expectedMatch?: StepInputBinding & { schema: OutputSchema };
        observation?: StepInputBinding & { schema: OutputSchema };
        evidence?: StepInputBinding & { schema: OutputSchema };
      };
    };
    outputs: { to: string | null; schema: OutputSchema };
    config: { message?: string; delayMs?: number; expectedText?: string };
    policy: {
      requiresAuthentication: boolean;
      humanApproval: 'enforced-by-provider-handler' | 'required-at-evidence-step' | 'not-required';
      allowUnrestrictedCode: false;
      verifyRealBrowserState: boolean;
    };
  };
}

export interface CompiledStep {
  readonly source: WorkflowStep;
  readonly document: StepDocument;
  readonly yaml: string;
  readonly digest: string;
}
export interface CompiledWorkflow {
  readonly plan: WorkflowPlan;
  readonly yaml: string;
  readonly steps: readonly CompiledStep[];
}

const stringValue = (value: string | number | boolean | null): string => {
  if (value === null) return 'null';
  if (typeof value !== 'string') return String(value);
  // JSON quoted scalars are valid YAML 1.2 and prevent injected keys, aliases,
  // directives, multiline commands and ambiguous scalar conversion.
  return JSON.stringify(value);
};
const block = (record: object, spaces: number): string =>
  Object.entries(record)
    .map(
      ([key, value]) =>
        `${' '.repeat(spaces) + key}: ${stringValue(value as string | number | boolean | null)}`,
    )
    .join('\n');

export function compileWorkflow(
  raw: WorkflowPlan,
  authored: ReadonlyMap<string, AuthoredStepDefinition> = new Map(),
): CompiledWorkflow {
  const plan = validatePlan(raw, raw.platform, raw.action);
  const mutating = plan.action !== 'audit' && plan.action !== 'audit-page';
  const steps = plan.steps.map((original, index): CompiledStep => {
    const definition = original.definition ? authored.get(original.id) : undefined;
    if (original.definition && !definition)
      throw Error(
        `Authored YAML definition must be resolved before compilation: ${original.definition.id}`,
      );
    const source = definition ? instantiateStep(original, definition) : original;
    if (source.kind === 'assess' && (!source.expectedText || !source.inputBindings?.text))
      throw Error('Assessment requires expectedText and a typed text binding');
    if (source.kind === 'evidence' && !source.inputBindings?.observation)
      throw Error('Evidence step requires an earlier observation binding');
    if (source.kind === 'approve' && !source.inputBindings?.evidence)
      throw Error('Approval step requires an earlier evidence binding');
    const nextId = plan.steps[index + 1]?.id ?? null;
    const previousId = plan.steps[index - 1]?.id ?? null;
    const operation = operationFor[source.kind];
    const observation = source.kind === 'inspect' || source.kind === 'verify';
    const action = source.kind === 'action';
    const bindings = source.inputBindings
      ? (Object.fromEntries(
          Object.entries(source.inputBindings).map(([target, reference]) => {
            const producer = plan.steps.find((step) => step.id === reference.stepId)!;
            return [target, { ...reference, schema: outputFor(producer.kind) }];
          }),
        ) as StepDocument['spec']['inputs']['bindings'])
      : undefined;
    const document: StepDocument = {
      apiVersion: 'utomator.dev/v1',
      kind: 'SocialStep',
      metadata: {
        id: source.id,
        title: source.title,
        workflow: plan.name,
        platform: plan.platform,
        ...(definition
          ? {
              definitionId: definition.metadata.id,
              definitionVersion: definition.metadata.version,
            }
          : {}),
      },
      spec: {
        operation,
        inputs: {
          from: previousId,
          scope: 'current-run',
          ...(bindings ? { bindings } : {}),
        },
        outputs: {
          to: nextId,
          schema: outputFor(source.kind),
        },
        config: {
          ...(source.message === undefined ? {} : { message: source.message }),
          ...(source.delayMs === undefined ? {} : { delayMs: source.delayMs }),
          ...(source.expectedText === undefined ? {} : { expectedText: source.expectedText }),
        },
        policy: {
          requiresAuthentication: !['start', 'finish'].includes(source.kind),
          humanApproval:
            source.kind === 'approve'
              ? 'required-at-evidence-step'
              : action && mutating
                ? 'enforced-by-provider-handler'
                : 'not-required',
          allowUnrestrictedCode: false,
          verifyRealBrowserState: action || observation,
        },
      },
    };
    const lines = [
      `apiVersion: ${stringValue(document.apiVersion)}`,
      `kind: ${stringValue(document.kind)}`,
      'metadata:',
      block(document.metadata, 2),
      'spec:',
      `  operation: ${stringValue(document.spec.operation)}`,
      '  inputs:',
      block({ from: document.spec.inputs.from, scope: document.spec.inputs.scope }, 4),
      ...(document.spec.inputs.bindings
        ? [
            '    bindings:',
            ...Object.entries(document.spec.inputs.bindings).flatMap(([target, reference]) => [
              `      ${target}:`,
              `        stepId: ${stringValue(reference.stepId)}`,
              `        field: ${stringValue(reference.field)}`,
              `        schema: ${stringValue(reference.schema)}`,
            ]),
          ]
        : []),
      '  outputs:',
      block(document.spec.outputs, 4),
      '  config:',
      ...(source.message !== undefined ? [`    message: ${stringValue(source.message)}`] : []),
      ...(source.delayMs !== undefined ? [`    delayMs: ${stringValue(source.delayMs)}`] : []),
      ...(source.expectedText !== undefined
        ? [`    expectedText: ${stringValue(source.expectedText)}`]
        : []),
      ...(source.message === undefined &&
      source.delayMs === undefined &&
      source.expectedText === undefined
        ? ['    {}']
        : []),
      '  policy:',
      block(document.spec.policy, 4),
    ];
    // Empty mappings must use YAML's explicit {} form.
    const yaml = `${lines.join('\n').replace('  config:\n    {}', '  config: {}')}\n`;
    return {
      source,
      document,
      yaml,
      digest: createHash('sha256').update(yaml).digest('hex'),
    };
  });
  const manifest = `${[
    'apiVersion: "utomator.dev/v1"',
    'kind: "SocialWorkflow"',
    'metadata:',
    `  name: ${stringValue(plan.name)}`,
    `  platform: ${stringValue(plan.platform)}`,
    `  action: ${stringValue(plan.action)}`,
    'spec:',
    '  graph: "linear"',
    '  schedule: "manual"',
    '  steps:',
    ...steps.map((step) =>
      [
        `    - id: ${stringValue(step.source.id)}`,
        `      document: ${stringValue(`${step.source.id}.yaml`)}`,
        `      sha256: ${stringValue(step.digest)}`,
      ].join('\n'),
    ),
  ].join('\n')}\n`;
  return { plan, yaml: manifest, steps };
}
