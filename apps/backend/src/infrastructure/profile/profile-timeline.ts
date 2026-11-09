import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isOwnedBy, isTrustedOwnerId } from '../../domain/ownership.js';
import { RunArchive } from '../runs/run-archive.js';
import { type PersistedRunEvent, parseRunJournal } from '../runs/run-journal.js';
import { runtimePath } from '../runtime/paths.js';

export interface IdentityObservation {
  runId: string;
  timestamp: string;
  platform: 'linkedin' | 'x';
  url: string;
  title: string | null;
  headline: string | null;
  bio: string | null;
  source: 'browser-audit';
}

// The runner already persists event journals. Summarize only observed fields,
// never a screenshot's free-text excerpt, credentials or unverified deductions.
export async function loadIdentityTimeline(
  ownerId?: string,
  directory = runtimePath('runs'),
): Promise<IdentityObservation[]> {
  if (!isTrustedOwnerId(ownerId)) return [];
  const records = new RunArchive(directory)
    .list()
    .filter(({ summary }) => isOwnedBy(summary, ownerId) && !summary.historyIncomplete);
  const files = await Promise.all(
    records.map(async ({ summary }) => {
      const events: PersistedRunEvent[] = [];
      try {
        const data = await readFile(resolve(directory, `${summary.id}.jsonl`), 'utf8');
        let since = 0;
        for (;;) {
          const page = parseRunJournal(data, summary.id, {
            since,
            expectedGrowth: summary.growth,
            expectedTerminal: summary,
          });
          events.push(...page.events);
          if (!page.hasMore) break;
          const last = page.events.at(-1);
          if (!last || last.id <= since) return [];
          since = last.id;
        }
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === 'ENOENT' ||
          (error instanceof Error && /^(Corrupt run journal|History incomplete)/.test(error.message))
        )
          return [];
        throw error;
      }
      return events.flatMap((event) => {
        try {
          const details = event.details as Record<string, unknown> | undefined;
          if (event.kind !== 'audit' || !details || typeof details.url !== 'string') return [];
          const url = new URL(details.url);
          const platform: IdentityObservation['platform'] | null =
            url.hostname === 'www.linkedin.com' || url.hostname === 'linkedin.com'
              ? 'linkedin'
              : url.hostname === 'x.com' || url.hostname === 'www.x.com'
                ? 'x'
                : null;
          if (!platform || url.protocol !== 'https:') return [];
          return [
            {
              runId: event.runId,
              timestamp: event.time,
              platform,
              url: url.href,
              title: typeof details.title === 'string' ? details.title.slice(0, 200) : null,
              headline: typeof details.headline === 'string' ? details.headline.slice(0, 300) : null,
              bio: typeof details.bio === 'string' ? details.bio.slice(0, 300) : null,
              source: 'browser-audit' as const,
            },
          ];
        } catch {
          return [];
        }
      });
    }),
  );
  return files
    .flat()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100);
}
