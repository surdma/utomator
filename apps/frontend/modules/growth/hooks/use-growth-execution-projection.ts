import { useEffect, useMemo, useState } from 'react';
import type { Run } from '../components/growth-profile-types';
import {
  type GrowthExecutionProjection,
  type GrowthExecutionRun,
  type GrowthJournalSnapshot,
  projectGrowthExecution,
} from '../model/growth-execution-projection';
import { fetchGrowthRunJournal } from '../model/growth-run-journal';

type Snapshot = {
  key: string;
  journals: Record<string, GrowthJournalSnapshot>;
  error: string;
};

export type GrowthExecutionView = {
  projection: GrowthExecutionProjection | null;
  error: string;
};

export function useGrowthExecutionProjection(
  run: Run | null,
): GrowthExecutionView {
  const childIds =
    run?.stages?.flatMap((stage) =>
      stage.childRunId ? [stage.childRunId] : [],
    ) ?? [];
  const key = JSON.stringify([
    run?.id,
    run?.programId,
    run?.programVersion,
    run?.sourceDigest,
    run?.stages?.map((stage) => [
      stage.id,
      stage.childRunId,
      stage.attempt,
      stage.planDigest,
    ]),
  ]);
  const childKey = JSON.stringify(childIds);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    key: '',
    journals: {},
    error: '',
  });

  useEffect(() => {
    const runIds = JSON.parse(childKey) as string[];
    if (runIds.length === 0) return;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      const journals: Record<string, GrowthJournalSnapshot> = {};
      const errors: string[] = [];
      await Promise.all(
        runIds.map(async (runId) => {
          try {
            const events = await fetchGrowthRunJournal(
              runId,
              controller.signal,
            );
            journals[runId] = {
              runId,
              events,
              complete: true,
            };
          } catch (reason) {
            journals[runId] = { runId, events: [], complete: false };
            errors.push(
              reason instanceof Error
                ? reason.message
                : 'Journal unavailable for a pipeline',
            );
          }
        }),
      );
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
  }, [key, childKey]);

  const projected = useMemo<GrowthExecutionView>(() => {
    if (!run) return { projection: null, error: '' };
    if (
      !run?.stages?.length ||
      !run.programId ||
      !Number.isSafeInteger(run.programVersion) ||
      !run.sourceDigest
    )
      return {
        projection: null,
        error:
          'Pinned execution identity is unavailable for this historical run.',
      };
    try {
      return {
        projection: projectGrowthExecution(
          run as GrowthExecutionRun,
          snapshot.key === key ? snapshot.journals : {},
        ),
        error: '',
      };
    } catch (reason) {
      return {
        projection: null,
        error:
          reason instanceof Error
            ? reason.message
            : 'Pinned execution is unavailable',
      };
    }
  }, [run, key, snapshot]);

  return {
    projection: projected.projection,
    error: projected.error || (snapshot.key === key ? snapshot.error : ''),
  };
}
