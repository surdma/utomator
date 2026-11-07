import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../domain/errors.js';

export type HttpErrorOptions = {
  fallback: string;
  defaultStatus: number;
  notFound?: boolean;
  conflictOnChange?: boolean;
  conflictOnVersion?: boolean;
  unprocessableOnApiConnector?: boolean;
};

/** Status and body for a route catch. Typed domain errors win. Untyped errors keep the phrase rules that route already used. */
export function httpErrorResponse(
  error: unknown,
  options: HttpErrorOptions,
): { status: number; error: string } {
  if (error instanceof NotFoundError) return { status: 404, error: error.message };
  if (error instanceof ConflictError) return { status: 409, error: error.message };
  if (error instanceof ValidationError) return { status: 400, error: error.message };
  if (error instanceof UnprocessableError) return { status: 422, error: error.message };

  const message = error instanceof Error ? error.message : options.fallback;
  if (options.notFound && message.includes('not found')) return { status: 404, error: message };
  if (options.conflictOnChange && message.includes('changed')) return { status: 409, error: message };
  if (options.conflictOnVersion && message.includes('version conflict'))
    return { status: 409, error: message };
  if (options.unprocessableOnApiConnector && message.includes('API connector'))
    return { status: 422, error: message };
  return { status: options.defaultStatus, error: message };
}
