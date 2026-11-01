import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eventsToConversation,
  findIncompleteEvent,
  findOpenClarify,
  findPendingStage,
  formatClarifyReply,
  mergeMatorEvents,
  stageResolution,
  pendingStageLabel,
  readClarifyQuestions,
  shouldSpeakHow,
} from '../components/dashboard/pipeline/mator-chat-state.ts';

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
    ]
  );
  assert.deepEqual(
    merged.map((event) => event.id),
    ['b', 'a']
  );
  assert.equal(merged[1].text, 'hi updated');
});

test('eventsToConversation maps user/how/message and keeps seed when empty', () => {
  assert.equal(eventsToConversation([])[0].id, 'seed');
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
  assert.deepEqual(
    bubbles.map((item) => item.sender),
    ['user', 'assistant']
  );
  assert.equal(bubbles.length, 2);
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
  assert.equal(findPendingStage(events)?.id, '3');
  assert.equal(findIncompleteEvent(events)?.id, '4');
  assert.equal(pendingStageLabel(findPendingStage(events)), 'add step');
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
  assert.equal(findPendingStage([staged])?.id, 's1');
  assert.equal(
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
    null
  );
  assert.equal(
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
    null
  );
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
  assert.equal(findIncompleteEvent([incomplete])?.id, 'i1');
  assert.equal(
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
    null
  );
  assert.equal(
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
    null
  );
});

test('shouldSpeakHow only for assistant how when enabled; never user', () => {
  assert.equal(
    shouldSpeakHow(
      {
        ...base,
        id: 'h',
        role: 'assistant',
        kind: 'how',
        text: 'Guidance',
      },
      true
    ),
    true
  );
  assert.equal(
    shouldSpeakHow(
      {
        ...base,
        id: 'h',
        role: 'assistant',
        kind: 'how',
        text: 'Guidance',
      },
      false
    ),
    false
  );
  assert.equal(
    shouldSpeakHow(
      {
        ...base,
        id: 'u',
        role: 'user',
        kind: 'message',
        text: 'hello',
      },
      true
    ),
    false
  );
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
  assert.equal(findOpenClarify([clarify])?.id, 'q');
  assert.equal(readClarifyQuestions(clarify.action)?.[0]?.name, 'tone');
  assert.equal(
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
    null
  );
  const form = new FormData();
  form.append('tone', 'Direct');
  assert.equal(
    formatClarifyReply(readClarifyQuestions(clarify.action), form),
    'Which tone? Direct'
  );
});

test('two outstanding staged proposals keep independent approval state', () => {
  const stages = [
    { ...base, id: 'proposal-one', role: 'assistant', kind: 'action', status: 'staged', action: { type: 'edit_step' } },
    { ...base, id: 'proposal-two', role: 'assistant', kind: 'action', status: 'staged', action: { type: 'edit_step' } },
  ];
  const events = [...stages, {
    ...base, id: 'decision-one', role: 'assistant', kind: 'action',
    status: 'rejected', action: { type: 'edit_step' }, resolvesEventId: 'proposal-one',
  }];
  assert.equal(stageResolution(events, 'proposal-one'), 'rejected');
  assert.equal(stageResolution(events, 'proposal-two'), null);
  assert.equal(findPendingStage(events)?.id, 'proposal-two');
  events.push({
    ...base, id: 'decision-two', role: 'assistant', kind: 'action',
    status: 'applied', action: { type: 'edit_step' }, resolvesEventId: 'proposal-two',
  });
  assert.equal(findPendingStage(events), null);
  assert.equal(stageResolution(events, 'proposal-two'), 'applied');
});

test('legacy unlinked stage decisions do not resolve every earlier proposal', () => {
  const events = [
    { ...base, id: 'old-one', role: 'assistant', kind: 'action', status: 'staged' },
    { ...base, id: 'old-two', role: 'assistant', kind: 'action', status: 'staged' },
    { ...base, id: 'old-decision', role: 'assistant', kind: 'action', status: 'applied' },
  ];
  assert.equal(stageResolution(events, 'old-two'), 'applied');
  assert.equal(stageResolution(events, 'old-one'), null);
  assert.equal(findPendingStage(events)?.id, 'old-one');
});
