/** Request-specific policy for Mator calls. Persisted global settings are not modified. */
export type MatorInteractionMode = 'text' | 'ai_call';

export function parseMatorInteractionMode(value: unknown): MatorInteractionMode {
  if (value === undefined || value === 'text') return 'text';
  if (value === 'ai_call') return 'ai_call';
  throw new TypeError('interactionMode must be text or ai_call');
}

/** Mutating AI Call actions must be staged until a real on-screen decision is made. */
export function mayAutoApproveMatorAction(
  globalAutoApprove: boolean,
  mode: MatorInteractionMode,
): boolean {
  return mode === 'text' && globalAutoApprove;
}
