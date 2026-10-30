import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eventsToConversation,
  findIncompleteEvent,
  findPendingStage,
  mergeMatorEvents,
  pendingStageLabel,
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
    ],
  );
  assert.deepEqual(
    merged.map((event) => event.id),
    ['b', 'a'],
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
    ['user', 'assistant'],
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
    null,
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
    null,
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
    null,
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
    null,
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
      true,
    ),
    true,
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
      false,
    ),
    false,
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
      true,
    ),
    false,
  );
});
