import { expect, test } from 'vitest';
import { EventJournal } from '../src/domain/events.js';

const input = (runId = 'r1', kind = 'step', message = 'm') => ({
  runId,
  kind,
  message,
  details: { stepId: 'inspect', stage: 'started' },
});

test('allocate assigns id and time but does not broadcast to subscribers', () => {
  const journal = new EventJournal();
  const received = [];
  journal.subscribe((evt) => received.push(evt));
  const event = journal.allocate(input('r1'));
  expect(event.id).toBe(1);
  expect(Number.isFinite(Date.parse(event.time))).toBe(true);
  expect(received).toHaveLength(0);
  expect(journal.getSince(0, 'r1')).toHaveLength(0);
});

test('publish allocates and broadcasts to subscribers', () => {
  const journal = new EventJournal();
  const received = [];
  journal.subscribe((evt) => received.push(evt));
  const event = journal.publish(input('r1'));
  expect(event.id).toBe(1);
  expect(received).toHaveLength(1);
  expect(received[0]).toBe(event);
});

test('retract discards an unwritten reservation and restores the next identity', () => {
  const journal = new EventJournal();
  const first = journal.allocate(input('r1'));
  journal.retract(first.id);
  expect(journal.getSince(0, 'r1')).toHaveLength(0);
  const next = journal.publish(input('r1'));
  expect(next.id).toBe(1);
  expect(journal.getSince(0, 'r1')).toHaveLength(1);
});

test('broadcast emits a previously allocated event to subscribers only', () => {
  const journal = new EventJournal();
  const received = [];
  journal.subscribe((evt) => received.push(evt));
  const event = journal.allocate(input('r1'));
  journal.broadcast(event);
  expect(received).toHaveLength(1);
  expect(received[0]).toBe(event);
});

test('events for a different run are not returned by getSince run filter', () => {
  const journal = new EventJournal();
  journal.publish(input('r1', 'step', 'one'));
  journal.publish(input('r2', 'step', 'two'));
  expect(journal.getSince(0, 'r1')).toHaveLength(1);
  expect(journal.getSince(0, 'r1')[0].message).toBe('one');
  expect(journal.getSince(0, 'r2')).toHaveLength(1);
});
