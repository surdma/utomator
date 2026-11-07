import { describe, expect, it } from 'vitest';
import {
  ApprovalDeniedError,
  AuthBlockedError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../src/domain/errors.js';

describe('domain errors', () => {
  it('classifies auth and approval failures as blocked', () => {
    const auth = new AuthBlockedError('sign in required');
    const approval = new ApprovalDeniedError('owner denied');
    expect(auth).toBeInstanceOf(Error);
    expect(approval).toBeInstanceOf(Error);
    expect(auth.kind).toBe('blocked');
    expect(approval.kind).toBe('blocked');
    expect(auth.name).toBe('AuthBlockedError');
    expect(approval.name).toBe('ApprovalDeniedError');
  });

  it('classifies expected HTTP failures by type', () => {
    expect(new NotFoundError('Social account not found').kind).toBe('not-found');
    expect(new ConflictError('Account changed').kind).toBe('conflict');
    expect(new ValidationError('Invalid account').kind).toBe('validation');
    expect(new UnprocessableError('API connector required').kind).toBe('unprocessable');
  });
});
