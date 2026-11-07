import { useEffect, useState } from 'react';
import type { GrowthJournalEvent } from '../components/growth-graph-model';
import { fetchGrowthRunJournalPage } from '../model/growth-run-journal';

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
    let inFlight = false;
    const refresh = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const page = await fetchGrowthRunJournalPage(
          childRunId,
          controller.signal,
        );
        if (active)
          setResult({
            runId: childRunId,
            entries: page.entries,
            error: page.truncated
              ? 'Earlier Runner events were omitted. Task history is incomplete.'
              : '',
          });
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setResult({
            runId: childRunId,
            entries: [],
            error:
              error instanceof Error ? error.message : 'Journal unavailable',
          });
        }
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2500);
    return () => {
      active = false;
      clearInterval(interval);
      controller.abort();
    };
  }, [childRunId]);

  return childRunId && result.runId === childRunId
    ? { journal: result.entries, logError: result.error }
    : { journal: [], logError: '' };
}
