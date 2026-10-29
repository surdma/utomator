import { useCallback, useEffect, useState } from 'react';
import type { Program, Run } from '../growth-profile-types';
import { request } from '../../../lib/growth-profile-client';

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
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
        // Only one outstanding poll at a time; cleanup aborts an in-flight request.
        if (active) timer = setTimeout(() => void poll(), 2500);
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
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
