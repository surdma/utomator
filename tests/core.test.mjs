import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, validateProfileUrl, validatePostUrl } from '../src/core/validate.ts';
import { EventJournal } from '../src/core/events.ts';
import { ApprovalGate } from '../src/core/approvals.ts';

const linkedIn = 'https://www.linkedin.com/in/surdma/';
const x = 'https://x.com/surdma';

test('only legitimate direct profile URLs are accepted', () => {
  assert.equal(validateProfileUrl('linkedin', linkedIn).pathname, '/in/surdma/');
  assert.equal(validateProfileUrl('x', x).pathname, '/surdma');
  for (const bad of ['http://x.com/surdma', 'https://x.com.evil.test/surdma', 'https://x.com/surdma/settings', 'https://evil.test']) {
    assert.throws(() => validateProfileUrl('x', bad));
  }
});
test('platform capabilities and required fields are enforced', () => {
  assert.doesNotThrow(() => validateRun({ platform: 'linkedin', action: 'audit', profileUrl: linkedIn }));
  assert.throws(() => validateRun({ platform: 'linkedin', action: 'delete-post', profileUrl: linkedIn }));
  assert.throws(() => validateRun({ platform: 'x', action: 'edit-profile', profileUrl: x }));
  assert.throws(() => validateRun({ platform: 'linkedin', action: 'add-skill', profileUrl: linkedIn, skill: ' ' }));
  assert.throws(() => validateRun({ platform: 'x', action: 'compose-post', profileUrl: x, postText: 'x'.repeat(281) }));
});
test('destructive post URLs cannot target a different account', () => {
  assert.equal(validatePostUrl(new URL(x), 'https://x.com/surdma/status/123').pathname, '/surdma/status/123');
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com/someone/status/123'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com/surdma/status/123?delete=yes'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://x.com:8443/surdma/status/123'));
  assert.throws(() => validatePostUrl(new URL(x), 'https://other@x.com/surdma/status/123'));
});
test('event IDs are increasing, replay filter works, subscriber unsubscribes', () => {
  const journal = new EventJournal();
  const received = [];
  const stop = journal.subscribe(evt => received.push(evt));
  journal.publish({ runId: 'one', kind: 'step', message: 'a' });
  journal.publish({ runId: 'two', kind: 'step', message: 'b' });
  journal.publish({ runId: 'one', kind: 'result', message: 'c' });
  assert.deepEqual(journal.getSince(1, 'one').map(evt => evt.message), ['c']);
  assert.deepEqual(received.map(evt => evt.id), [1, 2, 3]);
  stop();
  journal.publish({ runId: 'one', kind: 'step', message: 'd' });
  assert.equal(received.length, 3);
});
test('approval requires exact run/checkpoint identity and cannot be reused', async () => {
  const gate = new ApprovalGate(); const controller = new AbortController();
  let id;
  const pending = gate.request('run1', newId => { id = newId; }, controller.signal, 2000);
  assert.equal(gate.answer('run2', id, true), false);
  assert.equal(gate.answer('run1', 'wrong', true), false);
  assert.equal(gate.answer('run1', id, true), true);
  assert.equal(await pending, true);
  assert.equal(gate.answer('run1', id, true), false);
});
test('approval rejects aborts without allowing a save', async () => {
  const gate = new ApprovalGate(); const controller = new AbortController();
  const pending = gate.request('run1', () => {}, controller.signal, 2000);
  controller.abort();
  assert.equal(await pending, false);
});

test('human text prompt validates exact checkpoint and text length', async () => {
  const { PromptGate } = await import('../src/core/prompts.ts');
  const gate = new PromptGate(); const controller = new AbortController(); let checkpoint;
  const waiting = gate.request('run1', id => { checkpoint = id; }, controller.signal, 2000);
  assert.equal(gate.answer('run2', checkpoint, 'choice'), false);
  assert.equal(gate.answer('run1', checkpoint, '  '), false);
  assert.equal(gate.answer('run1', checkpoint, 'observed option'), true);
  assert.equal(await waiting, 'observed option');
});
