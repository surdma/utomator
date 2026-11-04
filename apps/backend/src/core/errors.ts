/** Typed errors for run-terminal state classification.
 *
 * Replaces brittle error-message regex matching in `runs/runner.ts` so that
 * auth/approval failures are classified by type rather than by parsing the
 * error string. Provider/engine code throws these; `Runner` inspects them with
 * `instanceof` (regex kept as a fallback for non-typed errors).
 */
export class AuthBlockedError extends Error {
  readonly kind = 'blocked' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AuthBlockedError';
  }
}

export class ApprovalDeniedError extends Error {
  readonly kind = 'blocked' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalDeniedError';
  }
}
