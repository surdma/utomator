import type { GrowthJournalEvent } from '../components/dashboard/growth/growth-graph-model';

export async function fetchGrowthRunJournal(
  childRunId: string,
  signal: AbortSignal
): Promise<GrowthJournalEvent[]> {
  const response = await fetch(
    '/api/runs/' + encodeURIComponent(childRunId) + '/logs',
    { cache: 'no-store', signal }
  );
  if (!response.ok) {
    throw Error(
      'Runner event journal unavailable (HTTP ' + response.status + ')'
    );
  }
  const entries: unknown = await response.json();
  if (!Array.isArray(entries)) throw Error('Invalid Runner journal');
  return entries as GrowthJournalEvent[];
}
