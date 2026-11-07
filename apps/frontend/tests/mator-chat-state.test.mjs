import { expect, test } from 'vitest';
import {
  eventsToConversation,
  findIncompleteEvent,
  findOpenClarify,
  findPendingStage,
  formatClarifyReply,
  mergeMatorEvents,
  pendingStageLabel,
  readClarifyQuestions,
  shouldRenderMatorEvent,
  shouldSpeakHow,
  stageResolution,
} from '../modules/mator/components/mator-chat-state.ts';

const base = {
  conversationId: 'c1',
  createdAt: '2026-10-30T10:00:00.000Z',
};

test('mergeMatorEvents dedupes by id and sorts by createdAt', () => {
  const merged = mergeMatorEvents(
    [
      {
        ...base,
        id: 'a',
        role: 'user',
        kind: 'message',
        text: 'hi',
        createdAt: '2026-10-30T10:00:02.000Z',
      },
    ],
    [
      {
        ...base,
        id: 'b',
        role: 'assistant',
        kind: 'how',
        text: 'hello',
        createdAt: '2026-10-30T10:00:01.000Z',
      },
      {
        ...base,
        id: 'a',
        role: 'user',
        kind: 'message',
        text: 'hi updated',
        createdAt: '2026-10-30T10:00:02.000Z',
      },
    ],
  );
  expect(merged.map((event) => event.id)).toEqual(['b', 'a']);
  expect(merged[1].text).toEqual('hi updated');
});

test('eventsToConversation maps user/how/message and keeps seed when empty', () => {
  expect(eventsToConversation([])[0].id).toEqual('seed');
  const bubbles = eventsToConversation([
    {
      ...base,
      id: 'u1',
      role: 'user',
      kind: 'message',
      text: 'rename inspect',
    },
    {
      ...base,
      id: 'h1',
      role: 'assistant',
      kind: 'how',
      text: 'I will rename that step.',
    },
    {
      ...base,
      id: 'a1',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      action: { type: 'edit_step' },
    },
  ]);
  expect(bubbles.map((item) => item.sender)).toEqual(['user', 'assistant']);
  expect(bubbles.length).toEqual(2);
});

test('findPendingStage returns latest unresolved staged', () => {
  const events = [
    {
      ...base,
      id: '1',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      action: { type: 'edit_step' },
    },
    {
      ...base,
      id: '2',
      role: 'assistant',
      kind: 'action',
      status: 'applied',
      action: { type: 'edit_step' },
    },
    {
      ...base,
      id: '3',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      action: { type: 'add_step' },
    },
    {
      ...base,
      id: '4',
      role: 'assistant',
      kind: 'message',
      status: 'incomplete',
      text: 'cut off',
    },
  ];
  expect(findPendingStage(events)?.id).toEqual('3');
  expect(findIncompleteEvent(events)?.id).toEqual('4');
  expect(pendingStageLabel(findPendingStage(events))).toEqual('add step');
});

test('findPendingStage clears after applied or rejected', () => {
  const staged = {
    ...base,
    id: 's1',
    role: 'assistant',
    kind: 'action',
    status: 'staged',
    action: { type: 'edit_step' },
  };
  expect(findPendingStage([staged])?.id).toEqual('s1');
  expect(
    findPendingStage([
      staged,
      {
        ...base,
        id: 'a1',
        role: 'assistant',
        kind: 'action',
        status: 'applied',
        action: { type: 'edit_step' },
      },
    ]),
  ).toEqual(null);
  expect(
    findPendingStage([
      staged,
      {
        ...base,
        id: 'r1',
        role: 'assistant',
        kind: 'action',
        status: 'rejected',
        action: { type: 'edit_step' },
      },
    ]),
  ).toEqual(null);
});

test('findIncompleteEvent clears after later assistant success', () => {
  const incomplete = {
    ...base,
    id: 'i1',
    role: 'assistant',
    kind: 'message',
    status: 'incomplete',
    text: 'cut off',
  };
  expect(findIncompleteEvent([incomplete])?.id).toEqual('i1');
  expect(
    findIncompleteEvent([
      incomplete,
      {
        ...base,
        id: 'u1',
        role: 'user',
        kind: 'message',
        text: 'Continue',
      },
      {
        ...base,
        id: 'h1',
        role: 'assistant',
        kind: 'how',
        text: 'Resumed and finished.',
      },
    ]),
  ).toEqual(null);
  expect(
    findIncompleteEvent([
      incomplete,
      {
        ...base,
        id: 'm1',
        role: 'assistant',
        kind: 'message',
        text: 'All done.',
      },
    ]),
  ).toEqual(null);
});

test('shouldSpeakHow only for assistant how when enabled; never user', () => {
  expect(
    shouldSpeakHow(
      {
        ...base,
        id: 'h',
        role: 'assistant',
        kind: 'how',
        text: 'Guidance',
      },
      true,
    ),
  ).toEqual(true);
  expect(
    shouldSpeakHow(
      {
        ...base,
        id: 'h',
        role: 'assistant',
        kind: 'how',
        text: 'Guidance',
      },
      false,
    ),
  ).toEqual(false);
  expect(
    shouldSpeakHow(
      {
        ...base,
        id: 'u',
        role: 'user',
        kind: 'message',
        text: 'hello',
      },
      true,
    ),
  ).toEqual(false);
});

test('open clarify stays until the user answers', () => {
  const clarify = {
    ...base,
    id: 'q',
    role: 'assistant',
    kind: 'clarify',
    action: {
      type: 'clarify',
      questions: [
        {
          name: 'tone',
          prompt: 'Which tone?',
          required: true,
          choices: [
            { value: 'direct', label: 'Direct' },
            { value: 'warm', label: 'Warm' },
          ],
        },
      ],
    },
  };
  expect(findOpenClarify([clarify])?.id).toEqual('q');
  expect(readClarifyQuestions(clarify.action)?.[0]?.name).toEqual('tone');
  expect(
    findOpenClarify([
      clarify,
      {
        ...base,
        id: 'u',
        role: 'user',
        kind: 'message',
        text: 'Which tone? Direct',
        createdAt: '2026-10-30T10:00:01.000Z',
      },
    ]),
  ).toEqual(null);
  const form = new FormData();
  form.append('tone', 'Direct');
  expect(
    formatClarifyReply(readClarifyQuestions(clarify.action), form),
  ).toEqual('Which tone? Direct');
});

test('typed URL and file clarify questions survive decoding', () => {
  const questions = readClarifyQuestions({
    type: 'clarify',
    questions: [
      {
        name: 'website',
        prompt: 'Which website?',
        inputType: 'url',
        required: true,
      },
      {
        name: 'attachment',
        prompt: 'Attach a screenshot',
        inputType: 'file',
        required: false,
      },
    ],
  });
  expect(questions?.map((item) => item.inputType)).toEqual(['url', 'file']);
  const form = new FormData();
  form.set('website', 'https://example.com/');
  form.set('attachment', 'capture.png');
  expect(formatClarifyReply(questions, form)).toEqual(
    'Which website? https://example.com/\nAttach a screenshot capture.png',
  );
});

test('two outstanding staged proposals keep independent approval state', () => {
  const stages = [
    {
      ...base,
      id: 'proposal-one',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      action: { type: 'edit_step' },
    },
    {
      ...base,
      id: 'proposal-two',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
      action: { type: 'edit_step' },
    },
  ];
  const events = [
    ...stages,
    {
      ...base,
      id: 'decision-one',
      role: 'assistant',
      kind: 'action',
      status: 'rejected',
      action: { type: 'edit_step' },
      resolvesEventId: 'proposal-one',
    },
  ];
  expect(stageResolution(events, 'proposal-one')).toEqual('rejected');
  expect(stageResolution(events, 'proposal-two')).toEqual(null);
  expect(findPendingStage(events)?.id).toEqual('proposal-two');
  events.push({
    ...base,
    id: 'decision-two',
    role: 'assistant',
    kind: 'action',
    status: 'applied',
    action: { type: 'edit_step' },
    resolvesEventId: 'proposal-two',
  });
  expect(findPendingStage(events)).toEqual(null);
  expect(stageResolution(events, 'proposal-two')).toEqual('applied');
});

test('legacy unlinked stage decisions do not resolve every earlier proposal', () => {
  const events = [
    {
      ...base,
      id: 'old-one',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
    },
    {
      ...base,
      id: 'old-two',
      role: 'assistant',
      kind: 'action',
      status: 'staged',
    },
    {
      ...base,
      id: 'old-decision',
      role: 'assistant',
      kind: 'action',
      status: 'applied',
    },
  ];
  expect(stageResolution(events, 'old-two')).toEqual('applied');
  expect(stageResolution(events, 'old-one')).toEqual(null);
  expect(findPendingStage(events)?.id).toEqual('old-one');
});

test('informational and historic no-op actions never become fake confirmation cards', () => {
  const stage = {
    ...base,
    id: 'stage-1',
    role: 'assistant',
    kind: 'action',
    status: 'staged',
    action: { type: 'edit_step', stepId: 'inspect' },
  };
  const decision = {
    ...base,
    id: 'applied-1',
    role: 'assistant',
    kind: 'action',
    status: 'applied',
    resolvesEventId: 'stage-1',
    action: stage.action,
  };
  const noop = {
    ...base,
    id: 'noop-1',
    role: 'assistant',
    kind: 'action',
    status: 'applied',
    action: { type: 'noop', reason: 'No changes' },
  };
  const how = {
    ...base,
    id: 'how-1',
    role: 'assistant',
    kind: 'how',
    text: 'Here is an explanation.',
  };
  const records = [stage, decision, noop, how];
  expect(
    records
      .filter((event) => shouldRenderMatorEvent(records, event))
      .map((event) => event.id),
  ).toEqual(['stage-1', 'how-1']);
  expect(stageResolution(records, 'stage-1')).toEqual('applied');
  expect(findPendingStage(records)).toEqual(null);
  const orphan = { ...decision, id: 'orphan', resolvesEventId: 'not-found' };
  expect(shouldRenderMatorEvent([orphan], orphan)).toEqual(true);
});

test('historic unlinked decision is shown once while unrelated events are retained', () => {
  const stage = {
    ...base,
    id: 'stage-old',
    role: 'assistant',
    kind: 'action',
    status: 'staged',
    action: { type: 'edit_step' },
  };
  const applied = {
    ...base,
    id: 'applied-old',
    role: 'assistant',
    kind: 'action',
    status: 'applied',
    action: stage.action,
  };
  const oldExplanation = {
    ...base,
    id: 'old-how',
    role: 'assistant',
    kind: 'action',
    status: 'staged',
    action: { type: 'explain_how' },
    text: 'Try reviewing the proposal.',
  };
  const records = [stage, applied, oldExplanation];
  expect(
    records
      .filter((event) => shouldRenderMatorEvent(records, event))
      .map((event) => event.id),
  ).toEqual(['stage-old', 'old-how']);
  expect(findPendingStage(records)).toEqual(null);
});
