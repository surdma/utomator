import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrowserSession } from '../browser/session.js';
import { ApprovalGate } from './approvals.js';
import { PromptGate } from './prompts.js';
import { EventJournal } from './events.js';
import type { RunRequest, RunSummary, StreamEvent } from './types.js';
import { validateRun } from './validate.js';
import { execute } from '../workflows/execute.js';
import { loginIfRequired } from '../auth/login.js';

export class Runner {
  readonly events = new EventJournal();
  private approvals = new ApprovalGate();
  private prompts = new PromptGate();
  private active?: { summary: RunSummary; controller: AbortController };
  private history = new Map<string, RunSummary>();

  start(input: RunRequest): RunSummary {
    const profile = validateRun(input);
    if (this.active) throw new Error('BUSY: another browser workflow is in progress');
    const summary: RunSummary = {
      id: randomUUID(), platform: input.platform, action: input.action,
      state: 'running', createdAt: new Date().toISOString(),
    };
    const controller = new AbortController();
    const logDir = resolve('.runtime', 'runs');
    mkdirSync(logDir, { recursive: true });
    const logPath = resolve(logDir, `${summary.id}.jsonl`);
    this.active = { summary, controller };
    this.history.set(summary.id, summary);
    if (this.history.size > 100) {
      const oldest = this.history.keys().next().value;
      if (oldest) this.history.delete(oldest);
    }
    const emit = (kind: StreamEvent['kind'], message: string, details?: unknown): void => {
      const event = this.events.publish({ runId: summary.id, kind, message, details });
      // Each run keeps its own human-readable event journal. No secrets or
      // session cookies are included in our event payloads.
      try { appendFileSync(logPath, `${JSON.stringify(event)}\n`, { mode: 0o600 }); }
      catch (error) { this.events.publish({ runId: summary.id, kind: 'error', message: `Log write failed: ${String(error)}` }); }
    };
    emit('status', 'Run queued for browser startup');
    const browser = new BrowserSession();
    void (async () => {
      try {
        const page = await browser.open(input.platform);
        const approve = async (message: string): Promise<void> => {
          summary.state = 'approval-needed';
          const approved = await this.approvals.request(summary.id, (checkpointId) => {
            summary.checkpoint = { id: checkpointId, message };
            emit('approval', message, { checkpointId });
          }, controller.signal);
          summary.checkpoint = undefined;
          if (!approved) throw new Error('Approval denied, cancelled, or timed out');
          summary.state = 'running';
          emit('status', 'Operator approved checkpoint');
        };
        await loginIfRequired(page, input, profile, approve, controller.signal);
        await execute({
          page, input, profile, runId: summary.id, signal: controller.signal, emit,
          ask: async (message) => {
            summary.state = 'input-needed';
            const response = await this.prompts.request(summary.id, (checkpointId) => {
              summary.checkpoint = { id: checkpointId, message };
              emit('input', message, { checkpointId });
            }, controller.signal);
            summary.checkpoint = undefined;
            if (!response) throw new Error('Text prompt unanswered or timed out');
            summary.state = 'running';
            emit('status', 'Operator supplied requested text');
            return response;
          },
          approve,
        });
        if (controller.signal.aborted) throw new Error('Run cancelled');
        summary.state = 'completed';
        emit('status', 'Run finished with verified steps');
      } catch (error) {
        let message = error instanceof Error ? error.message : String(error);
        for (const value of [input.credentials?.password, input.credentials?.loginId]) {
          if (value) message = message.replaceAll(value, '[redacted]');
        }
        summary.state = controller.signal.aborted ? 'cancelled' :
          /approval denied|not authenticated|not establish edit ownership/i.test(message) ? 'blocked' : 'failed';
        summary.error = message;
        emit('error', message);
        emit('status', `Run ended: ${summary.state}`);
      } finally {
        // Credentials are not stored in run summaries, journals, or screenshots.
        if (input.credentials) { input.credentials.password = ''; input.credentials.loginId = ''; }
        await browser.close().catch((e: unknown) => emit('error', `Browser cleanup failed: ${String(e)}`));
        if (this.active?.summary.id === summary.id) this.active = undefined;
      }
    })();
    return summary;
  }

  get(id: string): RunSummary | undefined { return this.history.get(id); }
  list(): RunSummary[] { return [...this.history.values()].reverse(); }

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
    this.active.controller.abort();
    return true;
  }
}
