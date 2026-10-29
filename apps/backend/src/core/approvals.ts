import { randomUUID } from 'node:crypto';

export class ApprovalGate {
  private waiting = new Map<
    string,
    {
      checkpointId: string;
      resolve: (approved: boolean) => void;
      timer: NodeJS.Timeout;
    }
  >();

  request(
    runId: string,
    onCheckpoint: (id: string) => void,
    signal: AbortSignal,
    timeoutMs = 600000
  ): Promise<boolean> {
    if (this.waiting.has(runId))
      throw new Error('A checkpoint is already pending');
    const checkpointId = randomUUID();
    return new Promise<boolean>((resolve) => {
      const finish = (approved: boolean) => {
        const pending = this.waiting.get(runId);
        if (!pending || pending.checkpointId !== checkpointId) return;
        clearTimeout(pending.timer);
        signal.removeEventListener('abort', onAbort);
        this.waiting.delete(runId);
        resolve(approved);
      };
      const onAbort = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.waiting.set(runId, { checkpointId, resolve: finish, timer });
      signal.addEventListener('abort', onAbort, { once: true });
      onCheckpoint(checkpointId);
      if (signal.aborted) finish(false);
    });
  }

  answer(runId: string, checkpointId: string, approved: boolean): boolean {
    const item = this.waiting.get(runId);
    if (!item || item.checkpointId !== checkpointId) return false;
    item.resolve(approved);
    return true;
  }
}
