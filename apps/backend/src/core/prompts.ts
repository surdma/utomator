import { randomUUID } from 'node:crypto';

export class PromptGate {
  private waiting = new Map<
    string,
    {
      id: string;
      resolve: (value: string | null) => void;
      timer: NodeJS.Timeout;
    }
  >();

  request(
    runId: string,
    onCheckpoint: (id: string) => void,
    signal: AbortSignal,
    timeoutMs = 600000,
  ): Promise<string | null> {
    if (this.waiting.has(runId)) throw new Error('A text response is already pending');
    const id = randomUUID();
    return new Promise((resolve) => {
      const finish = (value: string | null) => {
        const pending = this.waiting.get(runId);
        if (!pending || pending.id !== id) return;
        clearTimeout(pending.timer);
        signal.removeEventListener('abort', onAbort);
        this.waiting.delete(runId);
        resolve(value);
      };
      const onAbort = () => finish(null);
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.waiting.set(runId, { id, resolve: finish, timer });
      signal.addEventListener('abort', onAbort, { once: true });
      onCheckpoint(id);
      if (signal.aborted) finish(null);
    });
  }

  answer(runId: string, id: string, value: string): boolean {
    const item = this.waiting.get(runId);
    if (!item || item.id !== id || !value.trim() || value.length > 300) return false;
    item.resolve(value.trim());
    return true;
  }
}
