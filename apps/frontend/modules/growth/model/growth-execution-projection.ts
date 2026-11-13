/** A read-only projection of a pinned Growth release and observed child Runner history. */
export type ExecutionState =
  | 'waiting'
  | 'running'
  | 'approval-needed'
  | 'input-needed'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'finalizing'
  | 'unavailable';

export type GrowthTask = { id: string; title: string; kind: string };
export type GrowthSourceIdentity = {
  parentRunId: string;
  programId: string;
  programVersion: number;
  sourceDigest: string;
  stageId: string;
  attempt: number;
  planDigest: string;
};
export type GrowthPageEvidence = {
  url: string;
  digest: string;
  stepId?: string;
  sourceStepId?: string;
  outputId?: string;
  outputDigest?: string;
};
export type GrowthStage = {
  id: string;
  title: string;
  dependsOn: string;
  childRunId: string | null;
  attempt?: number;
  planDigest?: string;
  stepDigests?: Record<string, string>;
  pageEvidence?: GrowthPageEvidence | null;
  plan: { steps: GrowthTask[] };
};
export type GrowthChild = {
  id: string;
  childRunId: string | null;
  state: string;
  currentStepId: string | null;
  error: string | null;
  growth?: GrowthSourceIdentity;
  historyIncomplete?: boolean;
  cleanupComplete?: boolean;
  terminalEventId?: number;
};
export type GrowthExecutionRun = {
  id: string;
  programId: string;
  programVersion: number;
  sourceDigest: string;
  activeIndex: number;
  status: string;
  releasePending?: boolean;
  currentChild?: {
    id: string;
    checkpoint?: { id: string; message: string };
  } | null;
  currentPageEvidence?: GrowthPageEvidence | null;
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
  growth?: GrowthSourceIdentity;
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
  attempt?: number;
  output?: {
    id: string;
    digest: string;
    schema: string;
    evidenceDigest?: string;
  };
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
  runId: string;
  workflowId: string;
  workflowRevision: number;
  sourceDigest: string;
  pipelines: GrowthPipelineProjection[];
};

const terminal = new Set(['completed', 'failed', 'blocked', 'cancelled']);
const lifecycle = new Set(['started', 'completed', 'failed']);
const screenshotName = /^[a-zA-Z0-9_-]+\.png$/;
const validStepId = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const sha256 = /^[a-f0-9]{64}$/;
const eventKinds = new Set([
  'status',
  'step',
  'audit',
  'approval',
  'input',
  'screenshot',
  'error',
  'result',
]);
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isGrowthRecordedEvent(
  value: unknown,
  runId: string,
): value is GrowthRecordedEvent {
  const event = asRecord(value);
  return Boolean(
    event &&
      event.runId === runId &&
      typeof event.id === 'number' &&
      Number.isSafeInteger(event.id) &&
      event.id > 0 &&
      typeof event.time === 'string' &&
      Number.isFinite(Date.parse(event.time)) &&
      typeof event.message === 'string' &&
      typeof event.kind === 'string' &&
      eventKinds.has(event.kind),
  );
}

export function orderedGrowthEvents(
  runId: string,
  events: readonly GrowthRecordedEvent[],
): { entries: GrowthRecordedEvent[]; conflicts: boolean; invalid: boolean } {
  const byId = new Map<number, GrowthRecordedEvent>();
  const conflicts = new Set<number>();
  let invalid = false;
  for (const event of events) {
    if (!isGrowthRecordedEvent(event, runId)) {
      invalid = true;
      continue;
    }
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
    invalid,
  };
}

function matchesSource(raw: unknown, expected: GrowthSourceIdentity): boolean {
  const value = asRecord(raw);
  return Boolean(
    value &&
      Object.entries(expected).every(([key, entry]) => value[key] === entry),
  );
}

function taskOutput(
  data: Record<string, unknown>,
  runId: string,
  stepId: string,
): GrowthTaskProjection['output'] {
  if (
    data.outputId !== `${runId}:${stepId}:output` ||
    typeof data.outputDigest !== 'string' ||
    !sha256.test(data.outputDigest) ||
    typeof data.outputSchema !== 'string' ||
    !data.outputSchema.endsWith('/v1') ||
    (data.outputSchema === 'evidence/v1' &&
      (typeof data.evidenceDigest !== 'string' ||
        !sha256.test(data.evidenceDigest)))
  )
    return undefined;
  return {
    id: data.outputId,
    digest: data.outputDigest,
    schema: data.outputSchema,
    ...(typeof data.evidenceDigest === 'string'
      ? { evidenceDigest: data.evidenceDigest }
      : {}),
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
  if (
    !run.programId ||
    !sha256.test(run.sourceDigest) ||
    !Number.isSafeInteger(run.programVersion) ||
    run.programVersion < 1
  )
    throw Error('Growth execution has no pinned source identity');
  const stageIds = new Set<string>();
  for (const stage of run.stages) {
    if (!stage.id || stageIds.has(stage.id))
      throw Error('Missing or duplicate pipeline ID');
    stageIds.add(stage.id);
    const ids = new Set<string>();
    if (!stage.plan?.steps?.length)
      throw Error('Growth pipeline has no pinned tasks');
    for (const task of stage.plan.steps) {
      if (!validStepId.test(task.id) || ids.has(task.id))
        throw Error('Invalid or duplicate pinned task ID');
      ids.add(task.id);
    }
  }

  const byStage = new Map(run.pipelineRuns.map((stage) => [stage.id, stage]));
  if (byStage.size !== run.pipelineRuns.length)
    throw Error('Duplicate child pipeline registration');
  const childIds = run.stages.flatMap((stage) =>
    stage.childRunId ? [stage.childRunId] : [],
  );
  if (new Set(childIds).size !== childIds.length)
    throw Error('Duplicate child run registration');
  return {
    runId: run.id,
    workflowId: run.programId,
    workflowRevision: run.programVersion,
    sourceDigest: run.sourceDigest,
    pipelines: run.stages.map((stage): GrowthPipelineProjection => {
      const summary = byStage.get(stage.id);
      const identity: GrowthSourceIdentity = {
        parentRunId: run.id,
        programId: run.programId,
        programVersion: run.programVersion,
        sourceDigest: run.sourceDigest,
        stageId: stage.id,
        attempt: stage.attempt ?? 0,
        planDigest: stage.planDigest ?? '',
      };
      const pinned =
        Number.isSafeInteger(identity.attempt) &&
        identity.attempt > 0 &&
        sha256.test(identity.planDigest) &&
        stage.plan.steps.every((task) =>
          sha256.test(stage.stepDigests?.[task.id] ?? ''),
        );
      const matches = Boolean(
        pinned &&
          stage.childRunId &&
          summary &&
          summary.childRunId === stage.childRunId &&
          matchesSource(summary.growth, identity),
      );
      const runId = matches ? stage.childRunId : null;
      const snapshot = runId ? journals[runId] : undefined;
      const journalMatches = Boolean(snapshot && snapshot.runId === runId);
      const ordered =
        journalMatches && runId && snapshot
          ? orderedGrowthEvents(runId, snapshot.events)
          : {
              entries: [] as GrowthRecordedEvent[],
              conflicts: false,
              invalid: false,
            };
      let incomplete =
        Boolean(stage.childRunId) &&
        (!matches ||
          !journalMatches ||
          !snapshot?.complete ||
          ordered.conflicts ||
          ordered.invalid ||
          summary?.historyIncomplete === true);
      const recognized = new Set(stage.plan.steps.map((task) => task.id));
      const perTask = new Map<string, GrowthRecordedEvent[]>();
      let unattributedCount = 0;
      for (const event of ordered.entries) {
        if (!matchesSource(event.growth, identity)) {
          incomplete = true;
          unattributedCount++;
          continue;
        }
        const data = asRecord(event.details);
        const id = data?.stepId;
        if (typeof id !== 'string' || !recognized.has(id)) {
          if (event.kind !== 'status') unattributedCount++;
          continue;
        }
        if (
          !data ||
          data.attempt !== stage.attempt ||
          data.yamlSha256 !== stage.stepDigests?.[id]
        ) {
          if (event.kind === 'step' && lifecycle.has(String(data?.stage)))
            incomplete = true;
          unattributedCount++;
          continue;
        }
        if (
          event.kind === 'screenshot' &&
          (typeof data.fileName !== 'string' ||
            !screenshotName.test(data.fileName) ||
            data.evidenceId !== `${runId}:${data.fileName}`)
        ) {
          unattributedCount++;
          continue;
        }
        const list = perTask.get(id) ?? [];
        list.push(event);
        perTask.set(id, list);
      }
      const childState = !stage.childRunId
        ? 'waiting'
        : matches
          ? (summary?.state ?? 'unavailable')
          : 'unavailable';
      const tasks = stage.plan.steps.map((task): GrowthTaskProjection => {
        const events = perTask.get(task.id) ?? [];
        let state: ExecutionState =
          stage.childRunId && !matches ? 'unavailable' : 'waiting';
        let failure: string | undefined;
        let output: GrowthTaskProjection['output'];
        let invalidLifecycle = false;
        const screenshots = new Set<string>();
        for (const event of events) {
          const data = asRecord(event.details);
          const phase = data?.stage;
          if (
            data &&
            event.kind === 'step' &&
            typeof phase === 'string' &&
            lifecycle.has(phase)
          ) {
            if (phase === 'started') {
              state = 'running';
              output = undefined;
              failure = undefined;
            } else if (phase === 'completed') {
              const artifact = runId
                ? taskOutput(data, runId, task.id)
                : undefined;
              if (state !== 'running' || !artifact) invalidLifecycle = true;
              else {
                state = 'completed';
                output = artifact;
              }
            } else state = 'failed';
            if (phase === 'failed')
              failure =
                typeof data?.reason === 'string'
                  ? data.reason.slice(0, 400)
                  : 'Task failed';
          }
          if (
            event.kind === 'screenshot' &&
            typeof data?.fileName === 'string' &&
            screenshotName.test(data.fileName)
          )
            screenshots.add(data.fileName);
        }
        if (invalidLifecycle) incomplete = true;
        const current = matches && summary?.currentStepId === task.id;
        if (current && !terminal.has(childState)) {
          if (
            ['approval-needed', 'input-needed', 'paused'].includes(childState)
          )
            state = childState as ExecutionState;
          else if (childState === 'running' && state === 'waiting')
            state = 'running';
        }
        if (
          current &&
          ['failed', 'blocked', 'cancelled'].includes(childState)
        ) {
          state = childState as ExecutionState;
          if (summary?.error) failure = summary.error.slice(0, 400);
        }
        const checkpoint =
          run.currentChild?.id === runId && current
            ? run.currentChild.checkpoint?.id
            : undefined;
        const checkpointRecorded =
          checkpoint &&
          events.some(
            (event) =>
              event.kind ===
                (childState === 'approval-needed' ? 'approval' : 'input') &&
              asRecord(event.details)?.checkpointId === checkpoint,
          );
        return {
          id: task.id,
          title: task.title,
          kind: task.kind,
          state,
          events,
          screenshots: [...screenshots],
          ...(matches ? { attempt: stage.attempt } : {}),
          ...(output ? { output } : {}),
          ...(failure ? { failure } : {}),
          ...(checkpointRecorded &&
          !incomplete &&
          ['approval-needed', 'input-needed'].includes(childState)
            ? { checkpointId: checkpoint }
            : {}),
        };
      });
      // Missing or conflicted history cannot certify a task or authorize a checkpoint.
      if (incomplete)
        for (const task of tasks) {
          if (!['failed', 'blocked', 'cancelled'].includes(task.state))
            task.state = 'unavailable';
          delete task.output;
          delete task.checkpointId;
          task.screenshots = [];
        }
      let state: ExecutionState = (
        [
          'running',
          'approval-needed',
          'input-needed',
          'paused',
          'completed',
          'failed',
          'blocked',
          'cancelled',
          'waiting',
        ].includes(childState)
          ? childState
          : 'unavailable'
      ) as ExecutionState;
      if (incomplete && !['failed', 'blocked', 'cancelled'].includes(state))
        state = 'unavailable';
      if (state === 'completed') {
        const terminalEvent = ordered.entries.find(
          (event) => event.id === summary?.terminalEventId,
        );
        const terminalDetails = asRecord(terminalEvent?.details);
        const terminalRecorded =
          terminalEvent?.kind === 'status' &&
          matchesSource(terminalEvent.growth, identity) &&
          terminalDetails?.terminalState === 'completed' &&
          terminalDetails.cleanupComplete === true &&
          terminalDetails.historyIncomplete === false;
        const proof =
          stage.pageEvidence ??
          (run.currentChild?.id === runId ? run.currentPageEvidence : null);
        const producer = tasks.find((task) => task.id === proof?.stepId);
        const source = tasks.find((task) => task.id === proof?.sourceStepId);
        const evidenceRecorded =
          proof &&
          producer?.state === 'completed' &&
          source?.state === 'completed' &&
          producer.output?.schema === 'evidence/v1' &&
          producer.output.id === proof.outputId &&
          producer.output.digest === proof.outputDigest &&
          producer.output.evidenceDigest === proof.digest;
        if (incomplete) state = 'unavailable';
        else if (
          !terminalRecorded ||
          !evidenceRecorded ||
          summary?.cleanupComplete !== true ||
          tasks.some((task) => task.state !== 'completed') ||
          run.releasePending
        )
          state = 'finalizing';
      }
      return {
        id: stage.id,
        title: stage.title,
        dependsOn: stage.dependsOn,
        runId,
        state,
        tasks,
        completed: tasks.filter((t) => t.state === 'completed').length,
        total: tasks.length,
        historyIncomplete: incomplete,
        unattributedCount,
      };
    }),
  };
}
