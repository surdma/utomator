import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../src/domain/errors.js';
import { httpErrorResponse } from '../../src/interface/http/http-error.js';

describe('httpErrorResponse', () => {
  it('maps typed domain errors before message text', () => {
    expect(
      httpErrorResponse(new NotFoundError('Account changed'), {
        fallback: 'Invalid social profile',
        defaultStatus: 400,
      }),
    ).toEqual({ status: 404, error: 'Account changed' });
    expect(
      httpErrorResponse(new ConflictError('missing'), {
        fallback: 'Invalid account',
        defaultStatus: 400,
      }),
    ).toEqual({ status: 409, error: 'missing' });
    expect(
      httpErrorResponse(new ValidationError('bad field'), {
        fallback: 'Invalid account',
        defaultStatus: 409,
      }),
    ).toEqual({ status: 400, error: 'bad field' });
    expect(
      httpErrorResponse(new UnprocessableError('API connector required'), {
        fallback: 'Connection failed',
        defaultStatus: 400,
      }),
    ).toEqual({ status: 422, error: 'API connector required' });
  });

  it('keeps the existing message fallback for untyped errors', () => {
    expect(
      httpErrorResponse(new Error('Account changed'), {
        fallback: 'Invalid social profile',
        defaultStatus: 400,
        conflictOnChange: true,
        notFound: true,
      }),
    ).toEqual({ status: 409, error: 'Account changed' });
    expect(
      httpErrorResponse(new Error('Social account not found'), {
        fallback: 'Invalid social profile',
        defaultStatus: 400,
        conflictOnChange: true,
        notFound: true,
      }),
    ).toEqual({ status: 404, error: 'Social account not found' });
    expect(
      httpErrorResponse(new Error('version conflict'), {
        fallback: 'Unable to update draft',
        defaultStatus: 400,
        conflictOnVersion: true,
        notFound: true,
      }),
    ).toEqual({ status: 409, error: 'version conflict' });
    expect(
      httpErrorResponse(new Error('API connector is not ready'), {
        fallback: 'Connection failed',
        defaultStatus: 400,
        notFound: true,
        unprocessableOnApiConnector: true,
      }),
    ).toEqual({ status: 422, error: 'API connector is not ready' });
    expect(
      httpErrorResponse(new Error('planner rejected'), {
        fallback: 'Unable to approve',
        defaultStatus: 409,
        notFound: true,
      }),
    ).toEqual({ status: 409, error: 'planner rejected' });
    expect(
      httpErrorResponse('bad', {
        fallback: 'Invalid account',
        defaultStatus: 400,
      }),
    ).toEqual({ status: 400, error: 'Invalid account' });
  });
});
