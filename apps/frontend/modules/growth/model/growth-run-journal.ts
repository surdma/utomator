import type { GrowthJournalEvent } from '../components/growth-graph-model';
import type { GrowthRecordedEvent } from './growth-execution-projection';

export type GrowthJournalPage = {
  entries: GrowthJournalEvent[];
  truncated: boolean;
};

export async function fetchGrowthRunJournalPage(
  childRunId: string,
  signal: AbortSignal,
): Promise<GrowthJournalPage> {
  const response = await fetch(
    `/api/runs/${encodeURIComponent(childRunId)}/logs`,
    { cache: 'no-store', signal },
  );
  if (!response.ok) {
    throw Error(`Runner event journal unavailable (HTTP ${response.status})`);
  }
  const entries: unknown = await response.json();
  if (!Array.isArray(entries)) throw Error('Invalid Runner journal');
  return {
    entries: entries as GrowthJournalEvent[],
    truncated: response.headers?.get('x-run-journal-truncated') === 'true',
  };
}

export async function fetchGrowthRunJournal(
  childRunId: string,
  signal: AbortSignal,
): Promise<GrowthRecordedEvent[]> {
  const entries: GrowthRecordedEvent[] = [];
  // Consume every available page so histories over 1,000 events are complete
  // instead of stopping at the default page.
  let since = 0;
  for (;;) {
    if (signal.aborted) break;
    const response = await fetch(
      `/api/runs/${encodeURIComponent(childRunId)}/logs?since=${since}`,
      { cache: 'no-store', signal },
    );
    if (!response.ok) {
      throw Error(`Runner event journal unavailable (HTTP ${response.status})`);
    }
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw Error('Invalid Runner journal');
    entries.push(...(page as GrowthRecordedEvent[]));
    const hasMore = response.headers?.get('x-run-journal-has-more') === 'true';
    if (!hasMore || page.length === 0) break;
    since = (page as GrowthRecordedEvent[])[page.length - 1].id;
  }
  return entries;
}
