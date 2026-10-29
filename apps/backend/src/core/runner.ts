import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserSession } from '../browser/session.js';
import { ApprovalGate } from './approvals.js';
import { PromptGate } from './prompts.js';
import { EventJournal } from './events.js';
import type { RunRequest, RunSummary, StreamEvent } from './types.js';
import { validateRun } from './validate.js';
import { execute } from '../workflows/execute.js';
import {
  compileWorkflow,
  type CompiledStep,
  type CompiledWorkflow,
} from './workflow-yaml.js';
import { RunArchive } from './run-archive.js';
import type { AuthoredStepDefinition } from './step-definitions.js';
import {
  evidenceRecord,
  approvalDecision,
  isEvidenceRecord,
  isApprovalDecision,
  type EvidenceRecord,
  type ApprovalDecision,
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

export class Runner {
  readonly events = new EventJournal();
  private approvals = new ApprovalGate();
  private prompts = new PromptGate();
  private active?: {
    summary: RunSummary;
    controller: AbortController;
    pauseRequested: boolean;
    resume?: () => void;
    emit?: (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown
    ) => void;
  };
  private history = new Map<string, RunSummary>();
  private compiled = new Map<string, CompiledWorkflow>();
  private archive = new RunArchive();

  constructor(
    private readonly onSessionInvalid?: (id: string) => Promise<void>,
    private readonly verifyOwnerSession?: (
      page: Awaited<ReturnType<BrowserSession['open']>>,
      accountId: string,
      platform: string
    ) => Promise<void>
  ) {
    for (const entry of this.archive.restore().reverse())
      this.history.set(entry.summary.id, entry.summary);
  }

  start(
    input: RunRequest,
    definitions?: ReadonlyMap<string, AuthoredStepDefinition>
  ): RunSummary {
    const profile = validateRun(input);
    const compiled = input.workflow
      ? compileWorkflow(input.workflow, definitions)
      : undefined;
    if (
      compiled &&
      (compiled.plan.platform !== input.platform ||
        compiled.plan.action !== input.action)
    )
      throw new Error(
        'Workflow identity does not match the requested platform and action'
      );
    if (this.active)
      throw new Error('BUSY: another browser workflow is in progress');
    const summary: RunSummary = {
      id: randomUUID(),
      platform: input.platform,
      action: input.action,
      state: 'running',
      createdAt: new Date().toISOString(),
      ...(input.workflowId
        ? {
            workflowId: input.workflowId,
            workflowRevision: input.workflowRevision,
          }
        : {}),
    };
    const controller = new AbortController();
    const logDir = resolve('.runtime', 'runs');
    mkdirSync(logDir, { recursive: true, mode: 0o700 });
    const logPath = resolve(logDir, `${summary.id}.jsonl`);
    if (compiled) {
      const yamlDir = resolve(logDir, summary.id);
      mkdirSync(yamlDir, { recursive: true, mode: 0o700 });
      // The execution snapshot is immutable and written before the browser opens.
      writeFileSync(resolve(yamlDir, 'workflow.yaml'), compiled.yaml, {
        flag: 'wx',
        mode: 0o600,
      });
      if (input.workflowId && input.workflowRevision) {
        writeFileSync(
          resolve(yamlDir, 'source-revision.json'),
          JSON.stringify({
            workflowId: input.workflowId,
            workflowRevision: input.workflowRevision,
          }) + '\n',
          { flag: 'wx', mode: 0o600 }
        );
      }
      for (const step of compiled.steps) {
        writeFileSync(resolve(yamlDir, step.source.id + '.yaml'), step.yaml, {
          flag: 'wx',
          mode: 0o600,
        });
      }
      this.compiled.set(summary.id, compiled);
    }
    const archivedSteps = compiled?.steps.map((step) => step.source.id) ?? [];
    this.archive.save(summary, archivedSteps);
    this.active = { summary, controller, pauseRequested: false };
    this.history.set(summary.id, summary);
    if (this.history.size > 100) {
      const stale = this.history.keys().next().value;
      if (stale) {
        this.history.delete(stale);
        this.compiled.delete(stale);
      }
    }
    const emit = (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown
    ): void => {
      const event = this.events.publish({
        runId: summary.id,
        kind,
        message,
        details,
      });
      // Each run keeps its own human-readable event journal. No secrets or
      // session cookies are included in our event payloads.
      try {
        appendFileSync(logPath, JSON.stringify(event) + '\n', { mode: 0o600 });
      } catch (error) {
        this.events.publish({
          runId: summary.id,
          kind: 'error',
          message: `Log write failed: ${String(error)}`,
        });
      }
      this.archive.save(summary, archivedSteps);
    };
    this.active.emit = emit;
    emit('status', 'Run queued for browser startup');
    const browser = new BrowserSession();
    void (async () => {
      try {
        const page = await browser.open(input.platform, input.accountId);
        // A historical DB verification is not evidence of a still-valid browser
        // login. Check the actual account before executing any workflow stage.
        if (input.accountId && this.verifyOwnerSession) {
          try {
            await this.verifyOwnerSession(
              page,
              input.accountId,
              input.platform
            );
            emit('status', 'Authenticated account verified for this run');
          } catch (error) {
            summary.currentStepId = 'session';
            emit('step', 'Authentication failed for the selected account', {
              stepId: 'session',
              kind: 'session',
              stage: 'failed',
              reason:
                error instanceof Error
                  ? error.message
                  : 'Could not verify LinkedIn authentication',
            });
            throw error;
          }
        }
        emit(
          'status',
          browser.kind === 'existing-chrome'
            ? 'Browser session connected to existing Chrome. Existing logins are available to this run.'
            : 'Persistent Chrome profile opened. Logins in this automation profile are reused across runs.'
        );
        const context = {
          page,
          input,
          profile,
          runId: summary.id,
          signal: controller.signal,
          emit,
          ask: async (message: string) => {
            summary.state = 'input-needed';
            const response = await this.prompts.request(
              summary.id,
              (checkpointId) => {
                summary.checkpoint = { id: checkpointId, message };
                emit('input', message, { checkpointId });
              },
              controller.signal
            );
            summary.checkpoint = undefined;
            if (!response)
              throw new Error('Text prompt unanswered or timed out');
            summary.state = 'running';
            emit('status', 'Operator supplied requested text');
            return response;
          },
          approve: async (message: string) => {
            summary.state = 'approval-needed';
            const approved = await this.approvals.request(
              summary.id,
              (checkpointId) => {
                summary.checkpoint = { id: checkpointId, message };
                emit('approval', message, { checkpointId });
              },
              controller.signal
            );
            summary.checkpoint = undefined;
            if (!approved)
              throw new Error('Approval denied, cancelled, or timed out');
            summary.state = 'running';
            emit('status', 'Operator approved checkpoint');
          },
        };
        if (compiled) {
          const outcome = await this.executePlan(
            compiled,
            context,
            summary,
            controller.signal,
            emit
          );
          if (outcome === 'stopped') {
            summary.state = 'cancelled';
            emit('status', 'Run ended: cancelled (stopped by workflow stage)');
            return;
          }
        } else {
          await execute(context);
        }
        if (controller.signal.aborted) throw new Error('Run cancelled');
        summary.state = 'completed';
        emit('status', 'Run finished with verified steps');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const terminalState = controller.signal.aborted
          ? 'cancelled'
          : /approval denied|not authenticated|not establish edit ownership/i.test(
                message
              )
            ? 'blocked'
            : 'failed';
        summary.error = message;
        // Before executePlan starts, a browser/session failure has no failed task.
        // Attribute it to the actual session boundary for nested Growth diagnosis.
        if (compiled && !summary.currentStepId) {
          summary.currentStepId = 'session';
          emit('step', 'Failed: Establish authenticated browser session', {
            stepId: 'session',
            stage: 'failed',
            kind: 'session',
            reason: message.slice(0, 400),
          });
        }
        // Invalidate the expired connector before exposing a blocked run to clients.
        if (
          input.accountId &&
          /not authenticated|sign.in required|cannot establish edit ownership/i.test(
            message
          )
        ) {
          await this.onSessionInvalid?.(input.accountId).catch(() => {});
        }
        summary.state = terminalState;
        emit('error', message);
        emit('status', `Run ended: ${summary.state}`);
      } finally {
        if (input.login) {
          input.login.password = '';
          input.login = undefined;
        }
        await browser
          .close()
          .catch((e: unknown) =>
            emit('error', `Browser cleanup failed: ${String(e)}`)
          );
        if (this.active?.summary.id === summary.id) this.active = undefined;
      }
    })();
    return summary;
  }

  private async waitForResume(
    summary: RunSummary,
    emit: (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown
    ) => void,
    force: boolean,
    signal: AbortSignal
  ): Promise<void> {
    const active = this.active;
    if (!active || (!force && !active.pauseRequested)) return;
    if (signal.aborted) throw Error('Run cancelled');
    active.pauseRequested = true;
    summary.state = 'paused';
    emit('status', 'Run paused at a safe workflow boundary', {
      stepId: summary.currentStepId,
    });
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        active.resume = undefined;
        reject(Error('Run cancelled'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      active.resume = () => {
        signal.removeEventListener('abort', onAbort);
        active.resume = undefined;
        active.pauseRequested = false;
        summary.state = 'running';
        emit('status', 'Run resumed', { stepId: summary.currentStepId });
        resolve();
      };
      if (signal.aborted) onAbort();
    });
  }

  private async executePlan(
    compiled: CompiledWorkflow,
    ctx: Parameters<typeof execute>[0],
    summary: RunSummary,
    signal: AbortSignal,
    emit: (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown
    ) => void
  ): Promise<'finished' | 'stopped'> {
    summary.completedStepIds = [];
    const outputs = new Map<string, StepOutput>();
    for (const step of compiled.steps) {
      if (signal.aborted) throw Error('Run cancelled');
      summary.currentStepId = step.source.id;
      await this.waitForResume(
        summary,
        emit,
        step.document.spec.operation === 'await-operator',
        signal
      );
      emit('step', 'Started: ' + step.source.title, {
        stepId: step.source.id,
        stage: 'started',
        kind: step.source.kind,
        yamlSha256: step.digest,
      });
      let output: StepOutput;
      try {
        output = await this.executeStep(step, ctx, signal, emit, outputs);
        if (output.schema !== step.document.spec.outputs.schema)
          throw Error(
            'Step output schema does not match compiled YAML instruction'
          );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit('step', 'Failed: ' + step.source.title, {
          stepId: step.source.id,
          stage: 'failed',
          kind: step.source.kind,
          reason: message.slice(0, 400),
        });
        throw error;
      }
      // A completed stage must have an immutable result, not just a success log.
      writeFileSync(
        resolve(
          '.runtime',
          'runs',
          summary.id,
          step.source.id + '.output.json'
        ),
        JSON.stringify({ stepId: step.source.id, ...output }) + '\n',
        { flag: 'wx', mode: 0o600 }
      );
      outputs.set(step.source.id, output);
      summary.completedStepIds.push(step.source.id);
      emit('step', 'Completed: ' + step.source.title, {
        stepId: step.source.id,
        stage: 'completed',
        kind: step.source.kind,
        yamlSha256: step.digest,
        outputSchema: output.schema,
      });
      if (output.schema === 'status/v1' && output.status === 'stopped')
        return 'stopped';
    }
    return 'finished';
  }

  private async executeStep(
    step: CompiledStep,
    ctx: Parameters<typeof execute>[0],
    signal: AbortSignal,
    emit: (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown
    ) => void,
    outputs: ReadonlyMap<string, StepOutput>
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
      const trimPath = (value: string) =>
        value.endsWith('/') ? value.slice(0, -1) : value;
      if (
        observedPage.origin !== authorizedPage.origin ||
        trimPath(observedPage.pathname) !== trimPath(authorizedPage.pathname) ||
        observedPage.search ||
        observedPage.hash
      )
        throw Error(
          'Evidence page is outside the exact authorized profile scope'
        );
      const evidence = evidenceRecord(
        binding.stepId,
        'page-observation/v1',
        source.url,
        source.excerpt
      );
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
          '). Approve using this evidence for this workflow only. External provider writes require their own separate authorization.'
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
      const target =
        step.source.kind === 'inspect' ? ctx.profile.href : ctx.page.url();
      if (step.source.kind === 'inspect') {
        await ctx.page.goto(target, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      }
      if (signal.aborted) throw Error('Run cancelled');
      const summary = await ctx.page
        .locator('body')
        .innerText({ timeout: 10000 });
      const observation: StepOutput = {
        schema: 'page-observation/v1',
        url: ctx.page.url(),
        excerpt: summary.slice(0, 800),
      };
      emit('audit', step.source.title + ': observed browser content', {
        stepId: step.source.id,
        stage: 'observation',
        url: observation.url,
        excerpt: observation.excerpt,
      });
      return observation;
    }
    const bindingValue = (
      key: 'message' | 'delayMs' | 'text' | 'expectedMatch'
    ): string | number | boolean | undefined => {
      const binding = step.document.spec.inputs.bindings?.[key];
      if (!binding) return undefined;
      const source = outputs.get(binding.stepId);
      if (
        !source ||
        source.schema !== binding.schema ||
        !(binding.field in source)
      )
        throw Error(
          'Typed step input unavailable: ' +
            binding.stepId +
            '.' +
            binding.field
        );
      const value = (source as unknown as Record<string, unknown>)[
        binding.field
      ];
      const expectedType =
        key === 'delayMs'
          ? 'number'
          : key === 'expectedMatch'
            ? 'boolean'
            : 'string';
      if (typeof value !== expectedType)
        throw Error('Typed step input/output mismatch: ' + binding.stepId);
      return value as string | number | boolean;
    };
    if (operation === 'assess-observation') {
      const observed = bindingValue('text');
      const expected = step.document.spec.config.expectedText;
      if (typeof observed !== 'string' || !expected)
        throw Error(
          'Assessment requires a resolved text input and a reviewed expectation'
        );
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
        typeof resolved === 'string'
          ? resolved
          : step.document.spec.config.message || step.source.title
      ).slice(0, 600);
      emit('step', message, { stepId: step.source.id, stage: 'note' });
      return { schema: 'status/v1', status: 'completed', message };
    }
    if (operation === 'delay') {
      const resolved = bindingValue('delayMs');
      const duration =
        resolved === undefined
          ? (step.document.spec.config.delayMs ?? 0)
          : resolved;
      if (
        typeof duration !== 'number' ||
        !Number.isInteger(duration) ||
        duration < 0 ||
        duration > 30000
      )
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
      emit(
        'status',
        step.document.spec.config.message ||
          'Workflow reached operator-defined stop stage',
        { stepId: step.source.id }
      );
      return { schema: 'status/v1', status: 'stopped' };
    }
    if (
      !['begin', 'reuse-session', 'await-operator', 'complete-run'].includes(
        operation
      )
    )
      throw new Error('Unregistered YAML step operation: ' + operation);
    return { schema: 'status/v1', status: 'completed' };
  }

  stepOutput(
    runId: string,
    stepId: string
  ): (StepOutput & { stepId: string }) | null {
    if (!this.history.has(runId) || !this.archive.hasStep(runId, stepId))
      return null;
    const raw = this.archive.readArtifact(runId, stepId, 'output.json');
    if (!raw) return null;
    const result: unknown = JSON.parse(raw);
    if (!result || typeof result !== 'object')
      throw Error('Corrupt archived step output');
    const value = result as Partial<StepOutput> & {
      stepId?: string;
      matched?: unknown;
      summary?: unknown;
    };
    if (
      value.stepId !== stepId ||
      !(
        (value.schema === 'status/v1' &&
          ['completed', 'stopped'].includes(value.status ?? '') &&
          (value.message === undefined ||
            (typeof value.message === 'string' &&
              value.message.length <= 600)) &&
          (value.durationMs === undefined ||
            (Number.isInteger(value.durationMs) &&
              value.durationMs >= 0 &&
              value.durationMs <= 30000))) ||
        (value.schema === 'page-observation/v1' &&
          typeof value.url === 'string' &&
          typeof value.excerpt === 'string') ||
        (value.schema === 'action-event/v1' && value.status === 'completed') ||
        (value.schema === 'assessment/v1' &&
          typeof value.matched === 'boolean' &&
          typeof value.summary === 'string' &&
          value.summary.length <= 600) ||
        isEvidenceRecord(value) ||
        isApprovalDecision(value)
      )
    ) {
      throw Error('Corrupt archived step output');
    }
    return value as StepOutput & { stepId: string };
  }

  workflowYaml(runId: string, stepId?: string): string | null {
    if (!this.history.has(runId)) return null;
    const definition = this.compiled.get(runId);
    if (definition) {
      if (!stepId) return definition.yaml;
      return (
        definition.steps.find((step) => step.source.id === stepId)?.yaml ?? null
      );
    }
    return this.archive.readArtifact(runId, stepId);
  }

  pause(id: string): boolean {
    if (
      !this.active ||
      this.active.summary.id !== id ||
      this.active.pauseRequested ||
      this.active.summary.state !== 'running'
    )
      return false;
    this.active.pauseRequested = true;
    this.active.emit?.(
      'status',
      'Pause requested; waiting for a safe step boundary'
    );
    return true;
  }

  resume(id: string): boolean {
    if (
      !this.active ||
      this.active.summary.id !== id ||
      this.active.summary.state !== 'paused' ||
      !this.active.resume
    )
      return false;
    this.active.resume();
    return true;
  }

  /** A terminal summary may precede browser.close(); wait for idle before the next child. */
  isIdle(): boolean {
    return this.active === undefined;
  }
  get(id: string): RunSummary | undefined {
    return this.history.get(id);
  }
  list(): RunSummary[] {
    return [...this.history.values()].reverse();
  }

  decide(runId: string, checkpointId: string, approved: boolean): boolean {
    if (this.active?.summary.id !== runId) return false;
    return this.approvals.answer(runId, checkpointId, approved);
  }

  answerText(runId: string, checkpointId: string, value: string): boolean {
    if (this.active?.summary.id !== runId) return false;
    return this.prompts.answer(runId, checkpointId, value);
  }

  cancel(id: string): boolean {
    if (this.active?.summary.id !== id) return false;
    this.active.emit?.(
      'status',
      'Operator requested Stop; cancelling active run'
    );
    this.active.controller.abort();
    return true;
  }
}
