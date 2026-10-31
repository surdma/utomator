import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadIdentityTimeline } from '../profile/timeline.js';

export type MemoryEntry = {
  id: string;
  time: string;
  source: 'chat' | 'browser';
  platform: 'linkedin' | 'x' | null;
  accountId: string | null;
  text: string;
  runId?: string;
};
const sensitive =
  /\b(password|passcode|otp|verification code|secret key|private key|api key|bearer token|session cookie)\b/i;
export class ActivityMemory {
  private path: string;
  private writing: Promise<void> = Promise.resolve();
  constructor(root = process.cwd()) {
    this.path = resolve(root, '.runtime', 'intelligence', 'chat-events.jsonl');
  }
  async addChat(body: {
    text?: unknown;
    platform?: unknown;
    accountId?: unknown;
  }): Promise<MemoryEntry> {
    if (typeof body?.text !== 'string' || body.text.trim().length < 2 || body.text.length > 2000)
      throw Error('Chat message must contain 2–2000 characters');
    if (sensitive.test(body.text)) throw Error('Do not save secrets or login credentials in memory');
    const platform = body.platform === 'linkedin' || body.platform === 'x' ? body.platform : null;
    const accountId =
      typeof body.accountId === 'string' && /^[a-f0-9-]{36}$/i.test(body.accountId)
        ? body.accountId
        : null;
    const entry: MemoryEntry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      source: 'chat',
      platform,
      accountId,
      text: body.text.trim(),
    };
    const operation = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await appendFile(this.path, `${JSON.stringify(entry)}\n`, {
        mode: 0o600,
      });
    });
    this.writing = operation.catch(() => {});
    await operation;
    return entry;
  }
  async list(): Promise<MemoryEntry[]> {
    let lines: string[];
    try {
      lines = (await readFile(this.path, 'utf8')).split('\n').filter(Boolean);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      lines = [];
    }
    const chat = lines.slice(-300).flatMap((line) => {
      try {
        const record = JSON.parse(line) as MemoryEntry;
        return record.source === 'chat' && typeof record.text === 'string' ? [record] : [];
      } catch {
        return [];
      }
    });
    const audit = (await loadIdentityTimeline()).map((entry) => ({
      id: `${entry.runId}:${entry.timestamp}`,
      time: entry.timestamp,
      source: 'browser' as const,
      platform: entry.platform,
      accountId: null,
      text:
        [entry.title, entry.headline, entry.bio].filter(Boolean).join(' · ').slice(0, 600) ||
        'Profile page observed',
      runId: entry.runId,
    }));
    return [...chat, ...audit].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 300);
  }
}
