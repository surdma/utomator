import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ApprovalDeniedError, AuthBlockedError } from '../../domain/errors.js';
import { EventJournal } from '../../domain/events.js';
import { isGrowthRunIdentity, sameGrowthRunIdentity } from '../../domain/run-identity.js';
import type { RunRequest, RunState, RunSummary, StreamEvent } from '../../domain/types.js';
import { validateRun } from '../../domain/validate.js';
import { BrowserSession } from '../browser/session.js';
import { runtimePath } from '../runtime/paths.js';
import type { ApprovalEvidenceBinding } from '../workflow-steps/context.js';
import { execute } from '../workflows/execute.js';
import type { AuthoredStepDefinition } from '../workflows/step-definitions.js';
import { type CompiledWorkflow, compileWorkflow } from '../workflows/workflow-yaml.js';
import { ApprovalGate } from './approvals.js';
import { checkpointEventDetails } from './checkpoint-event.js';
import { isApprovalDecision, isEvidenceRecord } from './evidence-approval.js';
import { executePlan, type StepOutput } from './plan-executor.js';
import { PromptGate } from './prompts.js';
import { RunArchive } from './run-archive.js';
import {
  appendRunEvent,
  JournalWriteError,
  parseRunJournal,
  type RunJournalPage,
} from './run-journal.js';

export class Runner {
  readonly events = new EventJournal();
  private approvals = new ApprovalGate();
  private prompts = new PromptGate();
  private active?: {
    summary: RunSummary;
    controller: AbortController;
    pauseRequested: boolean;
    journalFailed: boolean;
    journalCorrupt: boolean;
    resume?: () => void;
    emit?: (kind: StreamEvent['kind'], message: string, details?: unknown) => void;
  };
  private history = new Map<string, RunSummary>();
  private compiled = new Map<string, CompiledWorkflow>();
  private archive = new RunArchive();

  constructor(
    private readonly onSessionInvalid?: (id: string) => Promise<void>,
    private readonly verifyOwnerSession?: (
      page: Awaited<ReturnType<BrowserSession['open']>>,
      accountId: string,
      platform: string,
    ) => Promise<void>,
  ) {
    for (const entry of this.archive.restore().reverse())
      this.history.set(entry.summary.id, entry.summary);
  }

  start(input: RunRequest, definitions?: ReadonlyMap<string, AuthoredStepDefinition>): RunSummary {
    const profile = validateRun(input);
    const compiled = input.workflow ? compileWorkflow(input.workflow, definitions) : undefined;
    if (compiled && (compiled.plan.platform !== input.platform || compiled.plan.action !== input.action))
      throw new Error('Workflow identity does not match the requested platform and action');
    if (
      input.growth !== undefined &&
      (!compiled ||
        !isGrowthRunIdentity(input.growth) ||
        createHash('sha256').update(compiled.yaml).digest('hex') !== input.growth.planDigest)
    )
      throw Error('Growth identity does not match the compiled plan digest');
    if (this.active) throw new Error('BUSY: another browser workflow is in progress');
    const summary: RunSummary = {
      id: randomUUID(),
      platform: input.platform,
      action: input.action,
      state: 'running',
      createdAt: new Date().toISOString(),
      historyIncomplete: false,
      cleanupComplete: false,
      ...(input.growth ? { growth: { ...input.growth } } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.workflowId
        ? {
            workflowId: input.workflowId,
            workflowRevision: input.workflowRevision,
          }
        : {}),
    };
    const controller = new AbortController();
    const logDir = runtimePath('runs');
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
          `${JSON.stringify({
            workflowId: input.workflowId,
            workflowRevision: input.workflowRevision,
          })}\n`,
          { flag: 'wx', mode: 0o600 },
        );
      }
      for (const step of compiled.steps) {
        writeFileSync(resolve(yamlDir, `${step.source.id}.yaml`), step.yaml, {
          flag: 'wx',
          mode: 0o600,
        });
      }
      this.compiled.set(summary.id, compiled);
    }
    const archivedSteps = compiled?.steps.map((step) => step.source.id) ?? [];
    const compiledStepIds = compiled ? new Set(archivedSteps) : undefined;
    this.archive.save(summary, archivedSteps);
    const active = {
      summary,
      controller,
      pauseRequested: false,
      journalFailed: false,
      journalCorrupt: false,
    };
    this.active = active;
    this.history.set(summary.id, summary);
    if (this.history.size > 100) {
      const stale = this.history.keys().next().value;
      if (stale) {
        this.history.delete(stale);
        this.compiled.delete(stale);
      }
    }
    const journalFailure = (error: unknown) => {
      active.journalFailed = true;
      active.journalCorrupt ||= error instanceof JournalWriteError && error.compromised;
      summary.historyIncomplete = true;
      summary.state = 'failed';
      summary.error = error instanceof Error ? error.message : String(error);
      controller.abort();
    };
    const persist = (
      kind: StreamEvent['kind'],
      message: string,
      details?: unknown,
      terminal = false,
    ) => {
      const currentStep = compiled?.steps.find((step) => step.source.id === summary.currentStepId);
      let boundDetails = details;
      if (details === undefined || (details && typeof details === 'object' && !Array.isArray(details))) {
        const record = (details ?? {}) as Record<string, unknown>;
        if (currentStep && record.stepId !== undefined && record.stepId !== currentStep.source.id)
          throw Error('Event step identity differs from the executing compiled step');
        boundDetails = {
          ...record,
          ...(currentStep
            ? {
                stepId: currentStep.source.id,
                attempt: summary.growth?.attempt ?? 1,
                yamlSha256: currentStep.digest,
              }
            : {}),
          ...(kind === 'screenshot' && typeof record.fileName === 'string'
            ? { evidenceId: `${summary.id}:${record.fileName}` }
            : {}),
        };
      }
      const event = this.events.allocate({
        runId: summary.id,
        kind,
        message,
        details: boundDetails,
        ...(summary.growth ? { growth: { ...summary.growth } } : {}),
      });
      try {
        appendRunEvent(logPath, event);
      } catch (error) {
        this.events.retract(event.id);
        journalFailure(error);
        throw error;
      }
      if (terminal) summary.terminalEventId = event.id;
      // A durable event may be replayed after restart. Its summary is written
      // before live delivery so subscribers cannot observe optimistic status.
      try {
        this.archive.save(summary, archivedSteps);
      } catch (error) {
        if (terminal) summary.terminalEventId = undefined;
        this.events.discard(event.id);
        const failure = new Error(`Run summary write failed: ${String(error)}`, { cause: error });
        journalFailure(failure);
        throw failure;
      }
      this.events.broadcast(event);
    };
    const emit = (kind: StreamEvent['kind'], message: string, details?: unknown): void => {
      if (active.journalFailed)
        throw new JournalWriteError(summary.error ?? 'Run journal unavailable', active.journalCorrupt);
      persist(kind, message, details);
    };
    this.active.emit = emit;
    const browser = new BrowserSession();
    void (async () => {
      let outcome: RunState = 'failed';
      try {
        emit('status', 'Run queued for browser startup');
        const page = await browser.open(input.platform, input.accountId);
        // A historical DB verification is not evidence of a still-valid browser
        // login. Check the actual account before executing any workflow stage.
        if (input.accountId && this.verifyOwnerSession) {
          try {
            await this.verifyOwnerSession(page, input.accountId, input.platform);
            emit('status', 'Authenticated account verified for this run');
          } catch (error) {
            summary.currentStepId = 'session';
            emit('step', 'Authentication failed for the selected account', {
              stepId: 'session',
              kind: 'session',
              stage: 'failed',
              reason:
                error instanceof Error ? error.message : 'Could not verify LinkedIn authentication',
            });
            throw error;
          }
        }
        emit(
          'status',
          browser.kind === 'existing-chrome'
            ? 'Browser session connected to existing Chrome. Existing logins are available to this run.'
            : 'Persistent Chrome profile opened. Logins in this automation profile are reused across runs.',
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
                emit(
                  'input',
                  message,
                  checkpointEventDetails(checkpointId, summary.currentStepId, compiledStepIds),
                );
              },
              controller.signal,
            );
            summary.checkpoint = undefined;
            if (controller.signal.aborted) throw new Error(summary.error ?? 'Run cancelled');
            if (!response) throw new Error('Text prompt unanswered or timed out');
            summary.state = 'running';
            emit('status', 'Operator supplied requested text');
            return response;
          },
          approve: async (message: string, evidence?: ApprovalEvidenceBinding) => {
            summary.state = 'approval-needed';
            let checkpointId = '';
            const approved = await this.approvals.request(
              summary.id,
              (id) => {
                checkpointId = id;
                summary.checkpoint = { id, message };
                emit('approval', message, {
                  ...checkpointEventDetails(id, summary.currentStepId, compiledStepIds),
                  ...evidence,
                });
              },
              controller.signal,
            );
            summary.checkpoint = undefined;
            if (controller.signal.aborted) throw new Error(summary.error ?? 'Run cancelled');
            if (!approved) throw new ApprovalDeniedError('Approval denied, cancelled, or timed out');
            summary.state = 'running';
            emit('status', 'Operator approved checkpoint', {
              checkpointId,
              approved: true,
              ...evidence,
            });
          },
        };
        if (compiled) {
          const outcome = await executePlan(
            compiled,
            context,
            summary,
            controller.signal,
            emit,
            (force, signal) => this.waitForResume(summary, emit, force, signal),
          );
          if (outcome === 'stopped') {
            controller.abort();
          }
        } else {
          await execute(context);
        }
        outcome = controller.signal.aborted ? 'cancelled' : 'completed';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isAuthBlocked = error instanceof AuthBlockedError;
        const isApprovalDenied = error instanceof ApprovalDeniedError;
        const terminalState = active.journalFailed
          ? 'failed'
          : controller.signal.aborted
            ? 'cancelled'
            : isAuthBlocked ||
                isApprovalDenied ||
                /approval denied|not authenticated|not establish edit ownership/i.test(message)
              ? 'blocked'
              : 'failed';
        summary.error = message;
        // Before executePlan starts, a browser/session failure has no failed task.
        // Attribute it to the actual session boundary for nested Growth diagnosis.
        if (compiled && !summary.currentStepId && !active.journalFailed) {
          summary.currentStepId = 'session';
          try {
            emit('step', 'Failed: Establish authenticated browser session', {
              stepId: 'session',
              stage: 'failed',
              kind: 'session',
              reason: message.slice(0, 400),
            });
          } catch (failure) {
            journalFailure(failure);
          }
        }
        // Invalidate the expired connector before exposing a blocked run to clients.
        if (
          input.accountId &&
          (isAuthBlocked ||
            /not authenticated|sign.in required|cannot establish edit ownership/i.test(message))
        ) {
          await this.onSessionInvalid?.(input.accountId).catch(() => {});
        }
        outcome = active.journalFailed ? 'failed' : terminalState;
        controller.abort();
      } finally {
        if (input.login) {
          input.login.password = '';
          input.login = undefined;
        }
        summary.checkpoint = undefined;
        try {
          await browser.close();
          summary.cleanupComplete = true;
        } catch (error) {
          outcome = 'failed';
          summary.cleanupComplete = false;
          summary.error = `Browser cleanup failed: ${String(error)}`;
        }
        if (outcome === 'completed' && controller.signal.aborted) outcome = 'cancelled';
        summary.state = active.journalFailed ? 'failed' : outcome;
        const finish = () =>
          persist(
            'status',
            summary.state === 'completed'
              ? 'Run finished with verified steps'
              : `Run ended: ${summary.state}`,
            {
              terminalState: summary.state,
              cleanupComplete: summary.cleanupComplete,
              historyIncomplete: summary.historyIncomplete,
              ...(summary.error ? { reason: summary.error } : {}),
            },
            true,
          );
        try {
          if (!active.journalCorrupt) {
            if (summary.error && !active.journalFailed) persist('error', summary.error);
            finish();
          }
        } catch (error) {
          journalFailure(error);
          summary.terminalEventId = undefined;
          // A failed success-record write must never leave a completed summary.
          // Only the failed terminal record may be retried; browser work is over.
          if (!active.journalCorrupt) {
            try {
              finish();
            } catch (failure) {
              journalFailure(failure);
            }
          }
        } finally {
          try {
            if (summary.terminalEventId === undefined) this.archive.save(summary, archivedSteps);
          } catch (error) {
            journalFailure(new Error(`Run summary write failed: ${String(error)}`, { cause: error }));
          }
          if (this.active?.summary.id === summary.id) this.active = undefined;
        }
      }
    })();
    return summary;
  }

  private async waitForResume(
    summary: RunSummary,
    emit: (kind: StreamEvent['kind'], message: string, details?: unknown) => void,
    force: boolean,
    signal: AbortSignal,
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
        reject(
          Error(active.journalFailed ? (summary.error ?? 'Run persistence failed') : 'Run cancelled'),
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
      active.resume = () => {
        active.pauseRequested = false;
        summary.state = 'running';
        try {
          emit('status', 'Run resumed', { stepId: summary.currentStepId });
        } catch (error) {
          reject(error);
          throw error;
        } finally {
          signal.removeEventListener('abort', onAbort);
          active.resume = undefined;
        }
        resolve();
      };
      if (signal.aborted) onAbort();
    });
  }

  stepOutput(
    runId: string,
    stepId: string,
  ): (StepOutput & { stepId: string; outputId?: string; outputDigest?: string }) | null {
    const run = this.history.get(runId);
    if (!run || !this.archive.hasStep(runId, stepId)) return null;
    const raw = this.archive.readArtifact(runId, stepId, 'output.json');
    if (!raw) return null;
    const result: unknown = JSON.parse(raw);
    if (!result || typeof result !== 'object') throw Error('Corrupt archived step output');
    const value = result as Partial<StepOutput> & {
      stepId?: string;
      matched?: unknown;
      summary?: unknown;
      runId?: string;
      growth?: unknown;
      outputId?: string;
      attempt?: number;
      yamlSha256?: string;
    };
    if (
      value.stepId !== stepId ||
      !(
        (value.schema === 'status/v1' &&
          ['completed', 'stopped'].includes(value.status ?? '') &&
          (value.message === undefined ||
            (typeof value.message === 'string' && value.message.length <= 600)) &&
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
        isEvidenceRecord(result) ||
        isApprovalDecision(result)
      )
    ) {
      throw Error('Corrupt archived step output');
    }
    if (value.runId !== undefined || run.growth) {
      if (run.historyIncomplete) return null;
      const yaml = this.workflowYaml(runId, stepId);
      if (
        value.runId !== runId ||
        value.outputId !== `${runId}:${stepId}:output` ||
        value.attempt !== (run.growth?.attempt ?? 1) ||
        !yaml ||
        value.yamlSha256 !== createHash('sha256').update(yaml).digest('hex') ||
        (run.growth && !sameGrowthRunIdentity(value.growth, run.growth))
      )
        throw Error('Corrupt archived step output identity');
      const outputDigest = createHash('sha256').update(raw).digest('hex');
      const journal = readFileSync(runtimePath('runs', `${runId}.jsonl`), 'utf8');
      let cursor = 0;
      for (;;) {
        const page = parseRunJournal(journal, runId, {
          since: cursor,
          expectedGrowth: run.growth,
          expectedTerminal: run,
        });
        if (
          page.events.some((event) => {
            const details = event.details as Record<string, unknown> | undefined;
            return (
              event.kind === 'step' &&
              details?.stage === 'completed' &&
              details.stepId === stepId &&
              details.outputId === value.outputId &&
              details.outputDigest === outputDigest &&
              details.attempt === value.attempt &&
              details.yamlSha256 === value.yamlSha256 &&
              (!run.growth || sameGrowthRunIdentity(event.growth, run.growth))
            );
          })
        )
          return { ...value, outputDigest } as StepOutput & {
            stepId: string;
            outputId: string;
            outputDigest: string;
          };
        if (!page.hasMore) return null;
        const last = page.events.at(-1);
        if (!last || last.id <= cursor) throw Error('Corrupt run journal');
        cursor = last.id;
      }
    }
    return value as StepOutput & { stepId: string };
  }

  workflowYaml(runId: string, stepId?: string): string | null {
    if (!this.history.has(runId)) return null;
    const definition = this.compiled.get(runId);
    if (definition) {
      if (!stepId) return definition.yaml;
      return definition.steps.find((step) => step.source.id === stepId)?.yaml ?? null;
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
    this.active.emit?.('status', 'Pause requested; waiting for a safe step boundary');
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

  /** The browser lock is released only after cleanup and terminal persistence. */
  isIdle(): boolean {
    return this.active === undefined;
  }
  get(id: string): RunSummary | undefined {
    return this.history.get(id);
  }
  list(): RunSummary[] {
    return [...this.history.values()].reverse();
  }
  listByConversation(conversationId: string): RunSummary[] {
    return [...this.history.values()]
      .filter((summary) => summary.conversationId === conversationId)
      .reverse();
  }

  async journalPage(
    runId: string,
    options: { since?: number; limit?: number } = {},
  ): Promise<RunJournalPage> {
    const run = this.history.get(runId);
    if (!run) throw Error('Run not found');
    if (run.historyIncomplete) throw Error('History incomplete: a journal write failed');
    const snapshot = { ...run };
    const raw = await readFile(runtimePath('runs', `${runId}.jsonl`), 'utf8');
    if (run.historyIncomplete) throw Error('History incomplete: a journal write failed');
    const page = parseRunJournal(raw, runId, {
      ...options,
      expectedGrowth: snapshot.growth,
      expectedTerminal: snapshot,
    });
    return page;
  }

  /** Only validated durable events can authorize a captured file. */
  async isScreenshotAuthorized(runId: string, fileName: string): Promise<boolean> {
    const run = this.history.get(runId);
    if (!run || !/^[a-zA-Z0-9_-]+\.png$/.test(fileName)) return false;
    try {
      let since = 0;
      for (;;) {
        const page = await this.journalPage(runId, { since });
        if (
          page.events.some((event) => {
            if (event.kind !== 'screenshot') return false;
            const details = event.details as Record<string, unknown> | undefined;
            if (details?.fileName !== fileName) return false;
            if (!run.growth) return true;
            if (
              details.evidenceId !== `${runId}:${fileName}` ||
              typeof details.stepId !== 'string' ||
              details.attempt !== run.growth.attempt
            )
              return false;
            const yaml = this.workflowYaml(runId, details.stepId);
            return Boolean(
              yaml && details.yamlSha256 === createHash('sha256').update(yaml).digest('hex'),
            );
          })
        )
          return true;
        if (!page.hasMore) return false;
        const last = page.events.at(-1);
        if (!last || last.id <= since) return false;
        since = last.id;
      }
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error instanceof Error && /^(Corrupt run journal|History incomplete)/.test(error.message))
      )
        return false;
      throw error;
    }
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
    const active = this.active;
    if (active?.summary.id !== id || active.controller.signal.aborted) return false;
    active.controller.abort();
    try {
      active.emit?.('status', 'Operator requested Stop; cancelling active run');
    } catch (error) {
      active.summary.state = 'failed';
      active.summary.historyIncomplete = true;
      active.summary.error = error instanceof Error ? error.message : String(error);
    }
    return true;
  }
}
