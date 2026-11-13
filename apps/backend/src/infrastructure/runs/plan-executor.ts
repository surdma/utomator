import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { GrowthRunIdentity, StreamEvent } from '../../domain/types.js';
import { runtimePath } from '../runtime/paths.js';
import { execute } from '../workflows/execute.js';
import type { CompiledStep, CompiledWorkflow } from '../workflows/workflow-yaml.js';
import {
  type ApprovalDecision,
  approvalDecision,
  type EvidenceRecord,
  evidenceRecord,
  isEvidenceRecord,
} from './evidence-approval.js';

export type StepOutput =
  | {
      schema: 'status/v1';
      status: 'completed' | 'stopped';
      message?: string;
      durationMs?: number;
    }
  | { schema: 'page-observation/v1'; url: string; excerpt: string }
  | { schema: 'action-event/v1'; status: 'completed' }
  | { schema: 'assessment/v1'; matched: boolean; summary: string }
  | EvidenceRecord
  | ApprovalDecision;

export type PlanContext = Parameters<typeof execute>[0];

export type StepEmitter = (kind: StreamEvent['kind'], message: string, details?: unknown) => void;

export type PauseGate = (force: boolean, signal: AbortSignal) => Promise<void>;

export interface PlanSummary {
  id: string;
  currentStepId?: string;
  completedStepIds?: string[];
  growth?: GrowthRunIdentity;
}

/** Executes a compiled linear workflow plan step-by-step.
 *
 * Pure over (compiled, ctx, signal, emit, waitForPause): it mutates only the
 * caller-supplied `summary` (currentStepId / completedStepIds) and writes
 * immutable per-step output artifacts under `.runtime/runs/<runId>/`.
 */
export async function executePlan(
  compiled: CompiledWorkflow,
  ctx: PlanContext,
  summary: PlanSummary,
  signal: AbortSignal,
  emit: StepEmitter,
  waitForPause: PauseGate,
): Promise<'finished' | 'stopped'> {
  summary.completedStepIds = [];
  const outputs = new Map<string, StepOutput>();
  for (const step of compiled.steps) {
    if (signal.aborted) throw Error('Run cancelled');
    summary.currentStepId = step.source.id;
    await waitForPause(step.document.spec.operation === 'await-operator', signal);
    emit('step', `Started: ${step.source.title}`, {
      stepId: step.source.id,
      stage: 'started',
      kind: step.source.kind,
      yamlSha256: step.digest,
    });
    let output: StepOutput;
    try {
      output = await executeStep(step, ctx, signal, emit, outputs);
      if (signal.aborted) throw Error('Run cancelled');
      if (output.schema !== step.document.spec.outputs.schema)
        throw Error('Step output schema does not match compiled YAML instruction');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit('step', `Failed: ${step.source.title}`, {
        stepId: step.source.id,
        stage: 'failed',
        kind: step.source.kind,
        reason: message.slice(0, 400),
      });
      throw error;
    }
    // A completed stage must have an immutable result, not just a success log.
    const outputId = `${summary.id}:${step.source.id}:output`;
    const artifact = `${JSON.stringify({
      stepId: step.source.id,
      ...output,
      runId: summary.id,
      outputId,
      attempt: summary.growth?.attempt ?? 1,
      yamlSha256: step.digest,
      ...(summary.growth ? { growth: summary.growth } : {}),
    })}\n`;
    writeFileSync(runtimePath('runs', summary.id ?? '', `${step.source.id}.output.json`), artifact, {
      flag: 'wx',
      mode: 0o600,
    });
    outputs.set(step.source.id, output);
    emit('step', `Completed: ${step.source.title}`, {
      stepId: step.source.id,
      stage: 'completed',
      kind: step.source.kind,
      yamlSha256: step.digest,
      outputSchema: output.schema,
      outputId,
      outputDigest: createHash('sha256').update(artifact).digest('hex'),
      attempt: summary.growth?.attempt ?? 1,
      ...(output.schema === 'evidence/v1' ? { evidenceDigest: output.digest } : {}),
    });
    summary.completedStepIds.push(step.source.id);
    if (output.schema === 'status/v1' && output.status === 'stopped') return 'stopped';
  }
  return 'finished';
}

/** Executes a single compiled step operation against the browser context. */
export async function executeStep(
  step: CompiledStep,
  ctx: PlanContext,
  signal: AbortSignal,
  emit: StepEmitter,
  outputs: ReadonlyMap<string, StepOutput>,
): Promise<StepOutput> {
  const operation = step.document.spec.operation;
  if (operation === 'capture-evidence') {
    const binding = step.document.spec.inputs.bindings?.observation;
    const source = binding && outputs.get(binding.stepId);
    if (
      !binding ||
      source?.schema !== 'page-observation/v1' ||
      binding.schema !== 'page-observation/v1' ||
      binding.field !== 'excerpt'
    )
      throw Error('Evidence source is not a completed page observation');
    const authorizedPage = new URL(ctx.input.pageUrl ?? ctx.profile.href);
    const observedPage = new URL(source.url);
    const trimPath = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value);
    if (
      observedPage.origin !== authorizedPage.origin ||
      trimPath(observedPage.pathname) !== trimPath(authorizedPage.pathname) ||
      observedPage.search ||
      observedPage.hash
    )
      throw Error('Evidence page is outside the exact authorized profile scope');
    const evidence = evidenceRecord(binding.stepId, 'page-observation/v1', source.url, source.excerpt);
    emit('step', 'Captured a provenance-bound read-only observation', {
      stepId: step.source.id,
      stage: 'evidence',
      sourceStepId: binding.stepId,
      sourceUrl: evidence.url,
      evidenceDigest: evidence.digest,
    });
    return evidence;
  }
  if (operation === 'require-evidence-approval') {
    const binding = step.document.spec.inputs.bindings?.evidence;
    const source = binding && outputs.get(binding.stepId);
    if (
      !binding ||
      !isEvidenceRecord(source) ||
      binding.schema !== 'evidence/v1' ||
      binding.field !== 'digest'
    )
      throw Error('Approval requires an earlier validated evidence snapshot');
    await ctx.approve(
      'Review observation ' +
        source.url +
        ' (SHA-256 ' +
        source.digest.slice(0, 12) +
        '). Approve using this evidence for this workflow only. External provider writes require their own separate authorization.',
      {
        evidenceStepId: binding.stepId,
        evidenceDigest: source.digest,
        evidenceOutputId: `${ctx.runId}:${binding.stepId}:output`,
      },
    );
    const decision = approvalDecision(source, true);
    emit('step', 'Owner approved the referenced evidence', {
      stepId: step.source.id,
      stage: 'approval',
      sourceStepId: binding.stepId,
      evidenceDigest: source.digest,
    });
    return decision;
  }
  if (operation === 'execute-approved-action') {
    await execute(ctx);
    return { schema: 'action-event/v1', status: 'completed' };
  }
  if (operation === 'observe-page') {
    const target = step.source.kind === 'inspect' ? ctx.profile.href : ctx.page.url();
    if (step.source.kind === 'inspect') {
      await ctx.page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
    if (signal.aborted) throw Error('Run cancelled');
    const summary = await ctx.page.locator('body').innerText({ timeout: 10000 });
    const observation: StepOutput = {
      schema: 'page-observation/v1',
      url: ctx.page.url(),
      excerpt: summary.slice(0, 800),
    };
    emit('audit', `${step.source.title}: observed browser content`, {
      stepId: step.source.id,
      stage: 'observation',
      url: observation.url,
      excerpt: observation.excerpt,
    });
    return observation;
  }
  const bindingValue = (
    key: 'message' | 'delayMs' | 'text' | 'expectedMatch',
  ): string | number | boolean | undefined => {
    const binding = step.document.spec.inputs.bindings?.[key];
    if (!binding) return undefined;
    const source = outputs.get(binding.stepId);
    if (!source || source.schema !== binding.schema || !(binding.field in source))
      throw Error(`Typed step input unavailable: ${binding.stepId}.${binding.field}`);
    const value = (source as unknown as Record<string, unknown>)[binding.field];
    const expectedType = key === 'delayMs' ? 'number' : key === 'expectedMatch' ? 'boolean' : 'string';
    if (typeof value !== expectedType)
      throw Error(`Typed step input/output mismatch: ${binding.stepId}`);
    return value as string | number | boolean;
  };
  if (operation === 'assess-observation') {
    const observed = bindingValue('text');
    const expected = step.document.spec.config.expectedText;
    if (typeof observed !== 'string' || !expected)
      throw Error('Assessment requires a resolved text input and a reviewed expectation');
    const matched = observed.toLowerCase().includes(expected.toLowerCase());
    const expectedMatch = bindingValue('expectedMatch');
    if (expectedMatch !== undefined && expectedMatch !== matched)
      throw Error('Assessment consistency check failed');
    const summary = matched
      ? 'Assessment matched the declared observation text'
      : 'Assessment did not match the declared observation text';
    emit('step', summary, {
      stepId: step.source.id,
      stage: 'assessment',
      matched,
    });
    return { schema: 'assessment/v1', matched, summary };
  }
  if (operation === 'record-event') {
    const resolved = bindingValue('message');
    const message = (
      typeof resolved === 'string' ? resolved : step.document.spec.config.message || step.source.title
    ).slice(0, 600);
    emit('step', message, { stepId: step.source.id, stage: 'note' });
    return { schema: 'status/v1', status: 'completed', message };
  }
  if (operation === 'delay') {
    const resolved = bindingValue('delayMs');
    const duration = resolved === undefined ? (step.document.spec.config.delayMs ?? 0) : resolved;
    if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 0 || duration > 30000)
      throw Error('Bound delay duration outside allowed range');
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(Error('Run cancelled'));
        return;
      }
      const stop = () => {
        clearTimeout(timer);
        reject(Error('Run cancelled'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop);
        resolve();
      }, duration);
      signal.addEventListener('abort', stop, { once: true });
    });
    return { schema: 'status/v1', status: 'completed', durationMs: duration };
  }
  if (operation === 'end-run') {
    emit('status', step.document.spec.config.message || 'Workflow reached operator-defined stop stage', {
      stepId: step.source.id,
    });
    return { schema: 'status/v1', status: 'stopped' };
  }
  if (!['begin', 'reuse-session', 'await-operator', 'complete-run'].includes(operation))
    throw new Error(`Unregistered YAML step operation: ${operation}`);
  return { schema: 'status/v1', status: 'completed' };
}
