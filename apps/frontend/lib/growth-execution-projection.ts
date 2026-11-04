/** A read-only projection of a pinned Growth release and observed child Runner history. */
export type ExecutionState =
  | 'waiting' | 'running' | 'approval-needed' | 'input-needed' | 'paused'
  | 'completed' | 'failed' | 'blocked' | 'cancelled' | 'finalizing' | 'unavailable';

export type GrowthTask = { id: string; title: string; kind: string };
export type GrowthStage = {
  id: string;
  title: string;
  dependsOn: string;
  childRunId: string | null;
  pageEvidence?: { url: string; digest: string } | null;
  plan: { steps: GrowthTask[] };
};
export type GrowthChild = {
  id: string;
  childRunId: string | null;
  state: string;
  currentStepId: string | null;
  error: string | null;
};
export type GrowthExecutionRun = {
  id: string;
  programId: string;
  programVersion: number;
  sourceDigest: string;
  activeIndex: number;
  status: string;
  releasePending?: boolean;
  currentChild?: { id: string; checkpoint?: { id: string; message: string } } | null;
  stages: GrowthStage[];
  pipelineRuns: GrowthChild[];
};
export type GrowthRecordedEvent = {
  id: number;
  runId: string;
  time: string;
  kind: string;
  message: string;
  details?: unknown;
};
export type GrowthJournalSnapshot = {
  runId: string;
  events: GrowthRecordedEvent[];
  complete: boolean;
};
export type GrowthTaskProjection = {
  id: string;
  title: string;
  kind: string;
  state: ExecutionState;
  events: GrowthRecordedEvent[];
  screenshots: string[];
  failure?: string;
  checkpointId?: string;
};
export type GrowthPipelineProjection = {
  id: string;
  title: string;
  dependsOn: string;
  runId: string | null;
  state: ExecutionState;
  tasks: GrowthTaskProjection[];
  total: number;
  completed: number;
  historyIncomplete: boolean;
  unattributedCount: number;
};
export type GrowthExecutionProjection = {
  workflowId: string;
  workflowRevision: number;
  sourceDigest: string;
  pipelines: GrowthPipelineProjection[];
};

const terminal = new Set(['completed', 'failed', 'blocked', 'cancelled']);
const lifecycle = new Set(['started', 'completed', 'failed']);
const screenshotName = /^[a-zA-Z0-9_-]+\.png$/;
const validStepId = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>) : null;
}

export function orderedGrowthEvents(
  runId: string,
  events: readonly GrowthRecordedEvent[],
): { entries: GrowthRecordedEvent[]; conflicts: boolean } {
  const byId = new Map<number, GrowthRecordedEvent>();
  const conflicts = new Set<number>();
  for (const event of events) {
    if (
      event.runId !== runId || !Number.isSafeInteger(event.id) || event.id < 1 ||
      typeof event.time !== 'string' || !Number.isFinite(Date.parse(event.time)) ||
      typeof event.message !== 'string'
    ) continue;
    if (conflicts.has(event.id)) continue;
    const prior = byId.get(event.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event)) {
      byId.delete(event.id);
      conflicts.add(event.id);
    } else if (!prior) {
      byId.set(event.id, event);
    }
  }
  return {
    entries: [...byId.values()].sort((a, b) => a.id - b.id),
    conflicts: conflicts.size > 0,
  };
}

/**
 * Never infer an executed task from its YAML declaration or a generic event.
 * The pinned release supplies structure; Runner events supply observations.
 */
export function projectGrowthExecution(
  run: GrowthExecutionRun,
  journals: Readonly<Record<string, GrowthJournalSnapshot | undefined>>,
): GrowthExecutionProjection {
  if (!run.programId || !run.sourceDigest || !Number.isSafeInteger(run.programVersion))
    throw Error('Growth execution has no pinned source identity');
  const stageIds = new Set<string>();
  for (const stage of run.stages) {
    if (!stage.id || stageIds.has(stage.id)) throw Error('Missing or duplicate pipeline ID');
    stageIds.add(stage.id);
    const ids = new Set<string>();
    if (!stage.plan?.steps?.length) throw Error('Growth pipeline has no pinned tasks');
    for (const task of stage.plan.steps) {
      if (!validStepId.test(task.id) || ids.has(task.id))
        throw Error('Invalid or duplicate pinned task ID');
      ids.add(task.id);
    }
  }

  const byStage = new Map(run.pipelineRuns.map((stage) => [stage.id, stage]));
  return {
    workflowId: run.programId,
    workflowRevision: run.programVersion,
    sourceDigest: run.sourceDigest,
    pipelines: run.stages.map((stage, index): GrowthPipelineProjection => {
      const summary = byStage.get(stage.id);
      const matches = Boolean(summary && summary.childRunId === stage.childRunId);
      const runId = matches ? stage.childRunId : null;
      const snapshot = runId ? journals[runId] : undefined;
      const journalMatches = Boolean(snapshot && snapshot.runId === runId);
      const ordered = journalMatches
        ? orderedGrowthEvents(runId!, snapshot!.events)
        : { entries: [] as GrowthRecordedEvent[], conflicts: false };
      const incomplete = Boolean(stage.childRunId) && (
        !matches || !journalMatches || !snapshot?.complete || ordered.conflicts
      );
      const recognized = new Set(stage.plan.steps.map((task) => task.id));
      const perTask = new Map<string, GrowthRecordedEvent[]>();
      let unattributedCount = 0;
      for (const event of ordered.entries) {
        const id = asRecord(event.details)?.stepId;
        if (typeof id !== 'string' || !recognized.has(id)) {
          unattributedCount++;
          continue;
        }
        const list = perTask.get(id) ?? [];
        list.push(event);
        perTask.set(id, list);
      }
      const childState = !stage.childRunId ? 'waiting' : matches ? summary!.state : 'unavailable';
      const tasks = stage.plan.steps.map((task): GrowthTaskProjection => {
        const events = perTask.get(task.id) ?? [];
        let state: ExecutionState = 'waiting';
        let failure: string | undefined;
        const screenshots = new Set<string>();
        for (const event of events) {
          const data = asRecord(event.details);
          const phase = data?.stage;
          if (event.kind === 'step' && typeof phase === 'string' && lifecycle.has(phase)) {
            state = phase === 'started' ? 'running' : phase === 'completed' ? 'completed' : 'failed';
            if (phase === 'failed')
              failure = typeof data?.reason === 'string' ? data.reason.slice(0, 400) : 'Task failed';
          }
          if (event.kind === 'screenshot' && typeof data?.fileName === 'string' && screenshotName.test(data.fileName))
            screenshots.add(data.fileName);
        }
        const current = matches && summary?.currentStepId === task.id;
        if (current && !terminal.has(childState)) {
          if (['approval-needed', 'input-needed', 'paused'].includes(childState))
            state = childState as ExecutionState;
          else if (childState === 'running' && state === 'waiting')
            state = 'running';
        }
        if (current && ['failed', 'blocked', 'cancelled'].includes(childState)) {
          state = childState as ExecutionState;
          if (summary?.error) failure = summary.error.slice(0, 400);
        }
        const checkpoint = run.currentChild?.id === runId && current
          ? run.currentChild.checkpoint?.id : undefined;
        return {
          id: task.id, title: task.title, kind: task.kind, state, events,
          screenshots: [...screenshots],
          ...(failure ? { failure } : {}),
          ...(checkpoint && ['approval-needed', 'input-needed'].includes(childState)
            ? { checkpointId: checkpoint } : {}),
        };
      });
      let state: ExecutionState = (
        ['running', 'approval-needed', 'input-needed', 'paused', 'completed',
          'failed', 'blocked', 'cancelled', 'waiting'].includes(childState)
          ? childState : 'unavailable'
      ) as ExecutionState;
      if (state === 'completed') {
        const proof = Boolean(stage.pageEvidence?.digest) ||
          (run.status !== 'active' && index === run.activeIndex);
        if (!proof || run.releasePending) state = 'finalizing';
      }
      return {
        id: stage.id, title: stage.title, dependsOn: stage.dependsOn,
        runId, state, tasks, completed: tasks.filter(t => t.state === 'completed').length,
        total: tasks.length, historyIncomplete: incomplete, unattributedCount,
      };
    }),
  };
}
