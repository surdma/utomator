import type { GrowthJournalEvent } from '../components/dashboard/growth/growth-graph-model';

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
): Promise<GrowthJournalEvent[]> {
  return (await fetchGrowthRunJournalPage(childRunId, signal)).entries;
}
