import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beginMatorSend,
  createMatorSendGate,
  finishMatorSendFailure,
  finishMatorSendSuccess,
} from '../components/dashboard/pipeline/mator-send-gate.ts';

/**
 * Asserted double-send policy:
 * While a send is in flight, a second beginMatorSend returns null so the hook
 * skips the network POST entirely (double-click = one request). After failure,
 * the same Idempotency-Key is reused on retry; after success, a new key is used.
 */

test('rapid second send while in-flight is a no-op (no second key / POST)', () => {
  let keyCount = 0;
  const newKey = () => {
    keyCount += 1;
    return `key-${keyCount}`;
  };

  let gate = createMatorSendGate();
  const first = beginMatorSend(gate, newKey);
  assert.ok(first);
  assert.equal(first.key, 'key-1');
  gate = first.next;

  const second = beginMatorSend(gate, newKey);
  assert.equal(second, null, 'second begin must no-op while inFlight');
  assert.equal(keyCount, 1, 'idempotency key must not be re-allocated mid-flight');
});

test('failure keeps idempotency key for retry; success clears for next turn', () => {
  let keyCount = 0;
  const newKey = () => {
    keyCount += 1;
    return `key-${keyCount}`;
  };

  let gate = createMatorSendGate();
  const first = beginMatorSend(gate, newKey);
  assert.ok(first);
  gate = finishMatorSendFailure(first.next);

  const retry = beginMatorSend(gate, newKey);
  assert.ok(retry);
  assert.equal(retry.key, 'key-1', 'retry after failure reuses Idempotency-Key');
  assert.equal(keyCount, 1);

  gate = finishMatorSendSuccess(retry.next);
  const nextTurn = beginMatorSend(gate, newKey);
  assert.ok(nextTurn);
  assert.equal(nextTurn.key, 'key-2', 'successful send clears key for next turn');
  assert.equal(keyCount, 2);
});
