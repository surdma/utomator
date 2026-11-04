import { useCallback, useEffect, useState } from 'react';
import { request } from '../../../../lib/growth-profile-client';
import type { Program, Run } from '../growth-profile-types';

type Snapshot = {
  key: string;
  program: Program;
  run: Run | null;
};

export function useGrowthProfileWorkflow(
  platform: 'linkedin' | 'x',
  templateId: string | null,
  accountId?: string,
) {
  const endpoint = templateId
    ? `/api/growth/templates/${encodeURIComponent(templateId)}`
    : '';
  const key = `${platform}/${templateId ?? ''}/${accountId ?? ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errorState, setErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const program = snapshot?.key === key ? snapshot.program : null;
  const run = snapshot?.key === key ? snapshot.run : null;
  const error = errorState?.key === key ? errorState.message : '';

  const setRun = useCallback(
    (next: Run | null) => {
      setSnapshot((current) =>
        current?.key === key ? { ...current, run: next } : current,
      );
    },
    [key],
  );

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (platform !== 'linkedin' || !templateId) return;
      const loaded = await request<Program>(endpoint, 'GET', undefined, signal);
      if (signal?.aborted) return;
      if (!accountId) {
        setSnapshot({ key, program: loaded, run: null });
        setErrorState(null);
        return;
      }
      const runs = await request<Run[]>(
        `${endpoint}/runs`,
        'GET',
        undefined,
        signal,
      );
      if (signal?.aborted) return;
      setSnapshot({
        key,
        program: loaded,
        run: runs.find((item) => item.accountId === accountId) ?? null,
      });
      setErrorState(null);
    },
    [platform, templateId, accountId, endpoint, key],
  );

  useEffect(() => {
    if (platform !== 'linkedin' || !templateId) return;
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await refresh(controller.signal);
      } catch (reason) {
        if (active && !controller.signal.aborted)
          setErrorState({
            key,
            message:
              reason instanceof Error
                ? reason.message
                : 'Cannot refresh Growth run',
          });
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 2500);
    return () => {
      active = false;
      clearInterval(interval);
      controller.abort();
    };
  }, [platform, templateId, key, refresh]);

  async function mutate(fn: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setErrorState(null);
    try {
      await fn();
      await refresh();
    } catch (reason) {
      setErrorState({
        key,
        message: reason instanceof Error ? reason.message : 'Request failed',
      });
    } finally {
      setWorking(false);
    }
  }

  return { endpoint, program, run, setRun, error, working, mutate };
}
