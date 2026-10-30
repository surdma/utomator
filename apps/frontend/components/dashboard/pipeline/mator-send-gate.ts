/**
 * Double-send policy for Mator chat:
 * - While a POST is in flight, a second send is a no-op (no second network call).
 * - The Idempotency-Key is allocated on first attempt and reused only after failure
 *   (retry path); it is cleared after success so the next user turn gets a new key.
 */

export type MatorSendGate = {
  inFlight: boolean;
  idempotencyKey: string | null;
};

export function createMatorSendGate(): MatorSendGate {
  return { inFlight: false, idempotencyKey: null };
}

export function beginMatorSend(
  gate: MatorSendGate,
  newKey: () => string,
): { key: string; next: MatorSendGate } | null {
  if (gate.inFlight) return null;
  const key = gate.idempotencyKey ?? newKey();
  return {
    key,
    next: { inFlight: true, idempotencyKey: key },
  };
}

export function finishMatorSendSuccess(gate: MatorSendGate): MatorSendGate {
  return { inFlight: false, idempotencyKey: null };
}

export function finishMatorSendFailure(gate: MatorSendGate): MatorSendGate {
  return { inFlight: false, idempotencyKey: gate.idempotencyKey };
}
