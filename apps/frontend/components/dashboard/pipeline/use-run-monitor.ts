'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, getApi } from './api-client';
import {
  belongsToRun,
  reconcileRunJournal,
  isPauseOrResume,
  isTerminalRunStatus,
} from './run-event-utils';
import type {
  Assessment,
  Checkpoint,
  Playbook,
  Review,
  Run,
  Event as RunEvent,
} from './run-models';
import type { Platform } from './workflow-catalog';

export function useRunMonitor(
  onNotice: (text: string) => void,
  onRunError: (text: string) => void,
) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [available, setAvailable] = useState<'checking' | 'ready' | 'offline'>(
    'checking',
  );
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointError, setCheckpointError] = useState('');
  const [inputReply, setInputReply] = useState('');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const journalRequestRef = useRef<AbortController | null>(null);
  const currentRunRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [health, recent, rules, savedReviews] = await Promise.all([
        fetch(getApi('health'), { cache: 'no-store' }),
        fetch(getApi('runs'), { cache: 'no-store' }),
        fetch(getApi('playbook'), { cache: 'no-store' }),
        fetch(getApi('visual-reviews'), { cache: 'no-store' }),
      ]);
      if (!health.ok) throw new Error('Engine health request failed');
      setAvailable('ready');
      if (recent.ok) {
        const list = (await recent.json()) as Run[];
        setRuns(list);
        if (currentRunRef.current) {
          const matching = list.find((run) => run.id === currentRunRef.current);
          if (matching) {
            setActive(matching);
            if (['completed', 'blocked', 'failed', 'cancelled'].includes(matching.state))
              setCheckpoint(null);
            else if (matching.checkpoint && ['approval-needed', 'input-needed'].includes(matching.state))
              setCheckpoint({
                kind: matching.state === 'approval-needed' ? 'approval' : 'input',
                id: matching.checkpoint.id,
                message: matching.checkpoint.message,
              });
          }
        }
      }
      if (rules.ok) setPlaybook((await rules.json()) as Playbook);
      if (savedReviews.ok) setReviews((await savedReviews.json()) as Review[]);
      if (currentRunRef.current) {
        const current = (await (
          await fetch(getApi(`runs/${currentRunRef.current}`), {
            cache: 'no-store',
          })
        ).json()) as Run;
        if (current.action === 'audit') {
          const report = await fetch(getApi(`runs/${current.id}/assessment`), {
            cache: 'no-store',
          });
          if (report.ok) setAssessment((await report.json()) as Assessment);
        }
      }
    } catch {
      setAvailable('offline');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 20000);
    return () => {
      clearInterval(timer);
      streamRef.current?.close();
      journalRequestRef.current?.abort();
    };
  }, [refresh]);
  function connect(runId: string) {
    streamRef.current?.close();
    const source = new EventSource(getApi(`events/${runId}`));
    streamRef.current = source;
    const kinds = [
      'status',
      'step',
      'audit',
      'approval',
      'input',
      'screenshot',
      'error',
      'result',
    ];
    const consume = (incoming: MessageEvent) => {
      const item = JSON.parse(incoming.data) as RunEvent;
      if (!belongsToRun(item, currentRunRef.current)) return;
      setEvents((prev) => reconcileRunJournal(prev, [item], item.runId));
      if (item.kind === 'approval' || item.kind === 'input') {
        setCheckpointError('');
        setCheckpoint({
          kind: item.kind,
          id: item.details?.checkpointId || '',
          message: item.message,
        });
      }
      if (isPauseOrResume(item)) void refresh();
      if (isTerminalRunStatus(item)) {
        setCheckpoint(null);
        void refresh();
      }
    };
    for (const kind of kinds)
      source.addEventListener(kind, consume as EventListener);
    source.onerror = () => {
      setAvailable('offline');
    }; // EventSource retries automatically.
  }
  async function hydrateRunJournal(runId: string) {
    journalRequestRef.current?.abort();
    const controller = new AbortController();
    journalRequestRef.current = controller;
    try {
      const response = await fetch(getApi(`runs/${runId}/logs`), {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw Error(`Runner journal unavailable (HTTP ${response.status})`);
      const archived: unknown = await response.json();
      if (!Array.isArray(archived)) throw Error('Invalid saved Runner journal');
      if (controller.signal.aborted || currentRunRef.current !== runId) return;
      setEvents((previous) => reconcileRunJournal(previous, archived as RunEvent[], runId));
      if (response.headers?.get('x-run-journal-truncated') === 'true')
        onRunError('Earlier Runner events were omitted. Execution history is incomplete.');
    } catch (error) {
      if (!controller.signal.aborted && currentRunRef.current === runId)
        onRunError(error instanceof Error ? error.message : 'Runner journal unavailable');
    }
  }

  async function startMonitoredRun(
    payload: Record<string, unknown>,
    action: string,
    platform: Platform,
  ) {
    const result = await apiPost('runs', payload);
    if (!result.id) throw new Error('Server did not return a run ID');
    currentRunRef.current = result.id;
    setCurrentRunId(result.id);
    setActive({
      id: result.id,
      action,
      platform,
      state: 'running',
      createdAt: new Date().toISOString(),
    });
    setEvents([]);
    setAssessment(null);
    setCheckpoint(null);
    connect(result.id);
    void refresh();
  }

  function selectRun(run: Run) {
    currentRunRef.current = run.id;
    setCurrentRunId(run.id);
    setActive(run);
    setEvents([]);
    setCheckpoint(
      run.checkpoint && ['approval-needed', 'input-needed'].includes(run.state)
        ? {
            kind: run.state === 'approval-needed' ? 'approval' : 'input',
            id: run.checkpoint.id,
            message: run.checkpoint.message,
          }
        : null,
    );
    streamRef.current?.close();
    if (!['completed', 'blocked', 'failed', 'cancelled'].includes(run.state))
      connect(run.id);
    void hydrateRunJournal(run.id);
  }
  async function pauseRun() {
    if (!active) return;
    try {
      await apiPost(`runs/${active.id}/pause`);
      void refresh();
    } catch (e) {
      onRunError(e instanceof Error ? e.message : 'Could not pause');
    }
  }
  async function resumeRun() {
    if (!active) return;
    try {
      await apiPost(`runs/${active.id}/resume`);
      void refresh();
    } catch (e) {
      onRunError(e instanceof Error ? e.message : 'Could not resume');
    }
  }
  async function act(approve: boolean, text?: string) {
    if (!active || !checkpoint) return;
    setCheckpointError('');
    try {
      if (checkpoint.kind === 'approval')
        await apiPost(`runs/${active.id}/decision`, {
          checkpointId: checkpoint.id,
          approved: approve,
        });
      else
        await apiPost(`runs/${active.id}/input`, {
          checkpointId: checkpoint.id,
          value: text || '',
        });
      setCheckpoint(null);
      setInputReply('');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Action failed';
      setCheckpointError(detail);
      onNotice(detail);
    }
  }
  async function cancelRun() {
    if (!active) return;
    try {
      await apiPost(`runs/${active.id}/cancel`);
      void refresh();
    } catch (error) {
      onNotice(String(error));
    }
  }

  return {
    available,
    playbook,
    assessment,
    runs,
    active,
    events,
    checkpoint,
    checkpointError,
    inputReply,
    setInputReply,
    reviews,
    currentRunId,
    refresh,
    startMonitoredRun,
    selectRun,
    pauseRun,
    resumeRun,
    act,
    cancelRun,
  };
}
