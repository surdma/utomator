import { useEffect, useMemo, useState } from 'react';
import type { Run } from '../components/dashboard/growth/growth-profile-types';
import { fetchGrowthRunJournalPage } from '../lib/growth-run-journal';
import {
  projectGrowthExecution,
  type GrowthExecutionProjection,
  type GrowthExecutionRun,
  type GrowthJournalSnapshot,
  type GrowthRecordedEvent,
} from '../lib/growth-execution-projection';

type Snapshot = {
  key: string;
  journals: Record<string, GrowthJournalSnapshot>;
  error: string;
};

export function useGrowthExecutionProjection(
  run: Run | null,
): { projection: GrowthExecutionProjection | null; error: string } {
  const childIds = run?.stages?.flatMap((stage) => stage.childRunId ? [stage.childRunId] : []) ?? [];
  const key = (run?.id ?? '') + ':' + childIds.join(',');
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: '', journals: {}, error: '' });

  useEffect(() => {
    if (childIds.length === 0) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      const journals: Record<string, GrowthJournalSnapshot> = {};
      const errors: string[] = [];
      await Promise.all(childIds.map(async (runId) => {
        try {
          const result = await fetchGrowthRunJournalPage(runId, controller.signal);
          journals[runId] = {
            runId,
            events: result.entries as GrowthRecordedEvent[],
            complete: !result.truncated,
          };
        } catch {
          journals[runId] = { runId, events: [], complete: false };
          errors.push('Journal unavailable for a pipeline');
        }
      }));
      if (!controller.signal.aborted)
        setSnapshot({ key, journals, error: errors.join('; ') });
      busy = false;
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [key]);

  const projection = useMemo(() => {
    if (
      !run?.stages?.length || !run.programId ||
      !Number.isSafeInteger(run.programVersion) || !run.sourceDigest
    ) return null;
    try {
      return projectGrowthExecution(run as GrowthExecutionRun,
        snapshot.key === key ? snapshot.journals : {});
    } catch {
      return null;
    }
  }, [run, key, snapshot]);

  return {
    projection,
    error: snapshot.key === key ? snapshot.error : '',
  };
}
