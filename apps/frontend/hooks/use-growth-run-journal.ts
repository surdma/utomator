import { useEffect, useState } from 'react';
import type { GrowthJournalEvent } from '../components/automate/growth-graph-model';
import { fetchGrowthRunJournal } from '../lib/growth-run-journal';

type JournalResult = {
  runId: string;
  entries: GrowthJournalEvent[];
  error: string;
};

export function useGrowthRunJournal(childRunId: string | null): {
  journal: GrowthJournalEvent[];
  logError: string;
} {
  const [result, setResult] = useState<JournalResult>({
    runId: '',
    entries: [],
    error: '',
  });

  useEffect(() => {
    if (!childRunId) return;
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const entries = await fetchGrowthRunJournal(childRunId, controller.signal);
        if (active) setResult({ runId: childRunId, entries, error: '' });
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setResult({
            runId: childRunId,
            entries: [],
            error: error instanceof Error ? error.message : 'Journal unavailable',
          });
        }
      } finally {
        // Schedule after completion so a slow response never races a newer poll.
        if (active) timer = setTimeout(() => void refresh(), 2500);
      }
    };
    void refresh();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [childRunId]);

  return childRunId && result.runId === childRunId
    ? { journal: result.entries, logError: result.error }
    : { journal: [], logError: '' };
}
