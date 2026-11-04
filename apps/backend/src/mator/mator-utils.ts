export class MatorActionValidationError extends Error {
  readonly code = 'MATOR_ACTION_VALIDATION' as const;
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'MatorActionValidationError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new MatorActionValidationError(`Invalid or missing ${field}`, field);
  return value;
}
