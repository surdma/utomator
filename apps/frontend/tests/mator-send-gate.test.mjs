import { expect, test } from 'vitest';
import {
  beginMatorSend,
  createMatorSendGate,
  finishMatorSendFailure,
  finishMatorSendSuccess,
} from '../modules/mator/components/mator-send-gate.ts';

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
  expect(first).toBeTruthy();
  expect(first.key).toEqual('key-1');
  gate = first.next;

  const second = beginMatorSend(gate, newKey);
  expect(second).toEqual(null);
  expect(keyCount).toEqual(1);
});

test('failure keeps idempotency key for retry; success clears for next turn', () => {
  let keyCount = 0;
  const newKey = () => {
    keyCount += 1;
    return `key-${keyCount}`;
  };

  let gate = createMatorSendGate();
  const first = beginMatorSend(gate, newKey);
  expect(first).toBeTruthy();
  gate = finishMatorSendFailure(first.next);

  const retry = beginMatorSend(gate, newKey);
  expect(retry).toBeTruthy();
  expect(retry.key).toEqual('key-1');
  expect(keyCount).toEqual(1);

  gate = finishMatorSendSuccess(retry.next);
  const nextTurn = beginMatorSend(gate, newKey);
  expect(nextTurn).toBeTruthy();
  expect(nextTurn.key).toEqual('key-2');
  expect(keyCount).toEqual(2);
});
