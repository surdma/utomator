export const childId = '11111111-1111-4111-8111-111111111111';
export const parentId = '22222222-2222-4222-8222-222222222222';
export const sourceDigest = 'a'.repeat(64);
export const planDigest = 'b'.repeat(64);
export const stepDigests = {
  observe: 'c'.repeat(64),
  baseline: 'd'.repeat(64),
};
export const evidenceDigest = 'e'.repeat(64);
export const outputDigest = 'f'.repeat(64);

export const identity = {
  parentRunId: parentId,
  programId: 'linkedin-profile',
  programVersion: 2,
  sourceDigest,
  stageId: 'inspect',
  attempt: 1,
  planDigest,
};

export function recordedEvent(id, stepId, phase, override = {}) {
  return {
    id,
    runId: childId,
    time: '2026-11-09T00:00:00.000Z',
    kind: 'step',
    message: phase,
    growth: { ...identity },
    details: {
      stepId,
      stage: phase,
      attempt: 1,
      yamlSha256: stepDigests[stepId],
      ...(phase === 'completed'
        ? {
            outputSchema:
              stepId === 'baseline' ? 'evidence/v1' : 'page-observation/v1',
            outputId: `${childId}:${stepId}:output`,
            outputDigest,
            ...(stepId === 'baseline' ? { evidenceDigest } : {}),
          }
        : {}),
    },
    ...override,
  };
}

export function completedEvents() {
  return [
    recordedEvent(1, 'observe', 'started'),
    recordedEvent(2, 'observe', 'completed'),
    recordedEvent(3, 'baseline', 'started'),
    recordedEvent(4, 'baseline', 'completed'),
    {
      id: 5,
      runId: childId,
      time: '2026-11-09T00:00:01.000Z',
      kind: 'status',
      message: 'Run completed after cleanup',
      growth: { ...identity },
      details: {
        terminalState: 'completed',
        cleanupComplete: true,
        historyIncomplete: false,
      },
    },
  ];
}

export function growthRun(override = {}) {
  return {
    id: parentId,
    programId: 'linkedin-profile',
    programVersion: 2,
    sourceDigest,
    status: 'completed-with-gaps',
    activeIndex: 0,
    releasePending: false,
    currentChild: null,
    stages: [
      {
        id: 'inspect',
        title: 'Profile inspection',
        dependsOn: 'none',
        childRunId: childId,
        attempt: 1,
        planDigest,
        stepDigests: { ...stepDigests },
        pageEvidence: {
          stepId: 'baseline',
          sourceStepId: 'observe',
          url: 'https://www.linkedin.com/in/example',
          digest: evidenceDigest,
          outputId: `${childId}:baseline:output`,
          outputDigest,
        },
        plan: {
          steps: [
            { id: 'observe', title: 'Observe profile', kind: 'inspect' },
            { id: 'baseline', title: 'Capture evidence', kind: 'evidence' },
          ],
          links: [{ source: 'observe', target: 'baseline' }],
        },
      },
    ],
    pipelineRuns: [
      {
        id: 'inspect',
        childRunId: childId,
        state: 'completed',
        currentStepId: 'baseline',
        error: null,
        growth: { ...identity },
        cleanupComplete: true,
        historyIncomplete: false,
        terminalEventId: 5,
      },
    ],
    ...override,
  };
}

export function journals(events = completedEvents(), complete = true) {
  return { [childId]: { runId: childId, events, complete } };
}
