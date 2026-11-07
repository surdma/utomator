import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ApprovalDeniedError, AuthBlockedError } from '../../domain/errors.js';
import { EventJournal } from '../../domain/events.js';
import type { RunRequest, RunSummary, StreamEvent } from '../../domain/types.js';
import { validateRun } from '../../domain/validate.js';
import { BrowserSession } from '../browser/session.js';
import { runtimePath } from '../runtime/paths.js';
import { execute } from '../workflows/execute.js';
import type { AuthoredStepDefinition } from '../workflows/step-definitions.js';
import {
  type CompiledStep,
  type CompiledWorkflow,
  compileWorkflow,
} from '../workflows/workflow-yaml.js';
import { ApprovalGate } from './approvals.js';
import { checkpointEventDetails } from './checkpoint-event.js';
import {
  type ApprovalDecision,
  approvalDecision,
  type EvidenceRecord,
  evidenceRecord,
  isApprovalDecision,
  isEvidenceRecord,
} from './evidence-approval.js';
import {
  executePlan,
  executeStep,
  type PauseGate,
  type PlanSummary,
  type StepOutput,
} from './plan-executor.js';
import { PromptGate } from './prompts.js';
import { RunArchive } from './run-archive.js';

export class Runner {
  readonly events = new EventJournal();
  private approvals = new ApprovalGate();
  private prompts = new PromptGate();
  private active?: {
    summary: RunSummary;
    controller: AbortController;
    pauseRequested: boolean;
    journalFailed: boolean;
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
    if (this.active) throw new Error('BUSY: another browser workflow is in progress');
    const summary: RunSummary = {
      id: randomUUID(),
      platform: input.platform,
      action: input.action,
      state: 'running',
      createdAt: new Date().toISOString(),
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
    this.active = { summary, controller, pauseRequested: false, journalFailed: false };
    this.history.set(summary.id, summary);
    if (this.history.size > 100) {
      const stale = this.history.keys().next().value;
      if (stale) {
        this.history.delete(stale);
        this.compiled.delete(stale);
      }
    }
    const emit = (kind: StreamEvent['kind'], message: string, details?: unknown): void => {
      const active = this.active;
      const input = { runId: summary.id, kind, message, details };
      // Allocate id/time now so the persisted record and the broadcast event
      // agree. Persist to the durable journal first: an event that cannot be
      // written must never be broadcast as a live successful task (publish
      // before persist would expose unconfirmed progress to consumers).
      const event = this.events.allocate(input);
      if (active?.journalFailed) {
        // The durable record is compromised. Broadcast in memory only so the
        // UI still learns the terminal outcome, but never write (or retry
        // writing) to a journal we can no longer trust.
        this.events.broadcast(event);
        return;
      }
      try {
        appendFileSync(logPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
      } catch (error) {
        // Fail closed: retract the unwritten allocation, mark the journal
        // compromised, and stop execution rather than exposing unrecorded
        // progress as a live successful task.
        this.events.retract(event.id);
        if (active) active.journalFailed = true;
        throw new Error(`Run journal write failed: ${String(error)}`);
      }
      this.events.broadcast(event);
      // Each run keeps its own human-readable event journal. No secrets or
      // session cookies are included in our event payloads.
      this.archive.save(summary, archivedSteps);
    };
    this.active.emit = emit;
    const browser = new BrowserSession();
    void (async () => {
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
            if (!response) throw new Error('Text prompt unanswered or timed out');
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
                emit(
                  'approval',
                  message,
                  checkpointEventDetails(checkpointId, summary.currentStepId, compiledStepIds),
                );
              },
              controller.signal,
            );
            summary.checkpoint = undefined;
            if (!approved) throw new ApprovalDeniedError('Approval denied, cancelled, or timed out');
            summary.state = 'running';
            emit('status', 'Operator approved checkpoint');
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
        const isAuthBlocked = error instanceof AuthBlockedError;
        const isApprovalDenied = error instanceof ApprovalDeniedError;
        const terminalState = controller.signal.aborted
          ? 'cancelled'
          : isAuthBlocked ||
              isApprovalDenied ||
              /approval denied|not authenticated|not establish edit ownership/i.test(message)
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
          (isAuthBlocked ||
            /not authenticated|sign.in required|cannot establish edit ownership/i.test(message))
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
          .catch((e: unknown) => emit('error', `Browser cleanup failed: ${String(e)}`));
        if (this.active?.summary.id === summary.id) this.active = undefined;
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

  stepOutput(runId: string, stepId: string): (StepOutput & { stepId: string }) | null {
    if (!this.history.has(runId) || !this.archive.hasStep(runId, stepId)) return null;
    const raw = this.archive.readArtifact(runId, stepId, 'output.json');
    if (!raw) return null;
    const result: unknown = JSON.parse(raw);
    if (!result || typeof result !== 'object') throw Error('Corrupt archived step output');
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
  listByConversation(conversationId: string): RunSummary[] {
    return [...this.history.values()]
      .filter((summary) => summary.conversationId === conversationId)
      .reverse();
  }

  /** Centralized screenshot-evidence authorization: in-memory journal plus the
   * persisted run journal (for restored history after a restart). */
  async isScreenshotAuthorized(runId: string, fileName: string): Promise<boolean> {
    if (
      this.events
        .getSince(0, runId)
        .some(
          (event) =>
            event.kind === 'screenshot' &&
            (event.details as { fileName?: unknown } | undefined)?.fileName === fileName,
        )
    ) {
      return true;
    }
    try {
      const rows = (await readFile(runtimePath('runs', runId + '.jsonl'), 'utf8')).split('\n');
      return rows.some((row) => {
        if (!row) return false;
        try {
          const entry = JSON.parse(row) as {
            kind?: string;
            details?: { fileName?: string };
          };
          return entry.kind === 'screenshot' && entry.details?.fileName === fileName;
        } catch {
          return false;
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return false;
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
    this.active.emit?.('status', 'Operator requested Stop; cancelling active run');
    this.active.controller.abort();
    this.active = undefined;
    return true;
  }
}
