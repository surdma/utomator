import {
  type GrowthRecordedEvent,
  isGrowthRecordedEvent,
} from './growth-execution-projection';

export type GrowthJournalPage = {
  entries: GrowthRecordedEvent[];
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
    entries: entries as GrowthRecordedEvent[],
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
    signal.throwIfAborted();
    const response = await fetch(
      `/api/runs/${encodeURIComponent(childRunId)}/logs?since=${since}`,
      { cache: 'no-store', signal },
    );
    if (!response.ok) {
      throw Error(`Runner event journal unavailable (HTTP ${response.status})`);
    }
    const page: unknown = await response.json();
    signal.throwIfAborted();
    if (!Array.isArray(page)) throw Error('Invalid Runner journal');
    if (response.headers?.get('x-run-journal-truncated') === 'true')
      throw Error('Runner journal is incomplete');
    let next = since;
    for (const event of page) {
      if (!isGrowthRecordedEvent(event, childRunId) || event.id <= next)
        throw Error('Invalid Runner journal event or cursor order');
      next = event.id;
      entries.push(event);
    }
    const hasMore = response.headers?.get('x-run-journal-has-more') === 'true';
    if (!hasMore) break;
    if (next === since) throw Error('Runner journal cursor made no progress');
    since = next;
  }
  return entries;
}
