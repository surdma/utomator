import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
export async function loadIdentityTimeline(): Promise<IdentityObservation[]> {
  const directory = resolve(process.cwd(), '.runtime', 'runs');
  let names: string[];
  try {
    names = (await readdir(directory)).filter((n) =>
      /^[a-f0-9-]{36}\.jsonl$/.test(n)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = await Promise.all(
    names.slice(-100).map(async (name) => {
      const data = await readFile(resolve(directory, name), 'utf8');
      return data.split('\n').flatMap((line) => {
        if (!line) return [];
        try {
          const event = JSON.parse(line) as {
            id: number;
            time: string;
            runId: string;
            kind: string;
            details?: {
              url?: unknown;
              title?: unknown;
              headline?: unknown;
              bio?: unknown;
            };
          };
          if (
            event.kind !== 'audit' ||
            !event.details ||
            typeof event.details.url !== 'string'
          )
            return [];
          const url = new URL(event.details.url);
          const platform: IdentityObservation['platform'] | null =
            url.hostname === 'www.linkedin.com' ||
            url.hostname === 'linkedin.com'
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
              title:
                typeof event.details.title === 'string'
                  ? event.details.title.slice(0, 200)
                  : null,
              headline:
                typeof event.details.headline === 'string'
                  ? event.details.headline.slice(0, 300)
                  : null,
              bio:
                typeof event.details.bio === 'string'
                  ? event.details.bio.slice(0, 300)
                  : null,
              source: 'browser-audit' as const,
            },
          ];
        } catch {
          return [];
        }
      });
    })
  );
  return files
    .flat()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 100);
}
