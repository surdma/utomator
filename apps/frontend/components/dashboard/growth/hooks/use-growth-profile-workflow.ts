import { useCallback, useEffect, useState } from 'react';
import type { Program, Run } from '../growth-profile-types';
import { request } from '../../../../lib/growth-profile-client';

export function useGrowthProfileWorkflow(
  platform: 'linkedin' | 'x',
  templateId: string,
  accountId?: string
) {
  const endpoint = '/api/growth/templates/' + encodeURIComponent(templateId);
  const [program, setProgram] = useState<Program | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (platform !== 'linkedin') return;
      const loaded = await request<Program>(endpoint, 'GET', undefined, signal);
      if (signal?.aborted) return;
      setProgram(loaded);
      if (!accountId) {
        setRun(null);
        return;
      }
      const runs = await request<Run[]>(
        endpoint + '/runs',
        'GET',
        undefined,
        signal
      );
      if (signal?.aborted) return;
      setRun(runs.find((item) => item.accountId === accountId) ?? null);
    },
    [platform, accountId, endpoint]
  );

  useEffect(() => {
    if (platform !== 'linkedin') return;
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    const poll = async () => {
      // An interval tick must not start a second request while one is pending.
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await refresh(controller.signal);
      } catch (reason) {
        if (active && !controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Cannot refresh Growth run'
          );
        }
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
  }, [platform, refresh]);

  async function mutate(fn: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed');
    } finally {
      setWorking(false);
    }
  }

  return { endpoint, program, run, setRun, error, working, mutate };
}
