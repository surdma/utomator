import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { operationFor, parseRestrictedYaml } from './step-definitions.js';
import type { StepKind } from './workflow-plan.js';

export type StepFormField = {
  key: 'message' | 'delayMs' | 'expectedText';
  label: string;
  control: 'text' | 'textarea' | 'number';
  min?: number;
  max?: number;
};
export type StepForm = {
  kind: StepKind;
  title: string;
  summary: string;
  fields: StepFormField[];
};
const supported = ['message', 'delayMs', 'expectedText'] as const;
function mapping(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid YAML step form mapping');
  return value as Record<string, unknown>;
}
export function parseStepForms(yaml: string): Record<StepKind, StepForm> {
  const document = mapping(parseRestrictedYaml(yaml));
  if (
    document.apiVersion !== 'utomator.dev/v1' ||
    document.kind !== 'StepForms' ||
    Object.keys(document).some((key) => !['apiVersion', 'kind', 'forms'].includes(key))
  )
    throw Error('Unknown step form document');
  const forms = mapping(document.forms);
  const result = {} as Record<StepKind, StepForm>;
  for (const kind of Object.keys(operationFor) as StepKind[]) {
    const definition = mapping(forms[kind]);
    const { title, summary } = definition;
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 100 ||
      typeof summary !== 'string' ||
      !summary.trim() ||
      summary.length > 300 ||
      Object.keys(definition).some((key) => !['title', 'summary', 'fields'].includes(key))
    )
      throw Error(`Invalid step form: ${kind}`);
    const rawFields = definition.fields === undefined ? {} : mapping(definition.fields);
    const fields: StepFormField[] = [];
    for (const [key, raw] of Object.entries(rawFields)) {
      const input = mapping(raw);
      if (
        !supported.includes(key as (typeof supported)[number]) ||
        (key === 'message' && !['note', 'stop', 'pause'].includes(kind)) ||
        (key === 'delayMs' && kind !== 'delay') ||
        (key === 'expectedText' && kind !== 'assess') ||
        Object.keys(input).some((k) => !['label', 'control', 'min', 'max'].includes(k)) ||
        typeof input.label !== 'string' ||
        !input.label.trim() ||
        input.label.length > 100 ||
        !['text', 'textarea', 'number'].includes(String(input.control)) ||
        (key === 'delayMs') !== (input.control === 'number') ||
        (input.min !== undefined && (!Number.isInteger(input.min) || Number(input.min) < 0)) ||
        (input.max !== undefined && (!Number.isInteger(input.max) || Number(input.max) > 30000)) ||
        (input.max !== undefined && input.min !== undefined && Number(input.min) > Number(input.max))
      )
        throw Error(`Invalid step form field: ${kind}.${key}`);
      fields.push({
        key: key as StepFormField['key'],
        label: input.label,
        control: input.control as StepFormField['control'],
        ...(input.min === undefined ? {} : { min: Number(input.min) }),
        ...(input.max === undefined ? {} : { max: Number(input.max) }),
      });
    }
    result[kind] = { kind, title, summary, fields };
  }
  if (Object.keys(forms).length !== Object.keys(operationFor).length)
    throw Error('Unknown step form kind');
  return result;
}
export async function loadStepForms(root = process.cwd()) {
  return parseStepForms(await readFile(resolve(root, 'step-forms.yaml'), 'utf8'));
}
