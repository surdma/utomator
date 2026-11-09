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

/** Expected absence. HTTP maps this to 404 without reading the message. */
export class NotFoundError extends Error {
  readonly kind = 'not-found' as const;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Expected revision or version clash. HTTP maps this to 409. */
export class ConflictError extends Error {
  readonly kind = 'conflict' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Caller input the route can reject. HTTP maps this to 400. */
export class ValidationError extends Error {
  readonly kind = 'validation' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The request is understood and still cannot be performed. HTTP maps this to 422. */
export class UnprocessableError extends Error {
  readonly kind = 'unprocessable' as const;
  constructor(message: string) {
    super(message);
    this.name = 'UnprocessableError';
  }
}
