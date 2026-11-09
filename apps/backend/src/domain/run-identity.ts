import type { GrowthRunIdentity } from './types.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const digest = /^[a-f0-9]{64}$/;
const identityKeys = [
  'parentRunId',
  'programId',
  'programVersion',
  'sourceDigest',
  'stageId',
  'attempt',
  'planDigest',
] as const;

export function isGrowthRunIdentity(value: unknown): value is GrowthRunIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<GrowthRunIdentity>;
  return (
    typeof item.parentRunId === 'string' &&
    uuid.test(item.parentRunId) &&
    typeof item.programId === 'string' &&
    identifier.test(item.programId) &&
    Number.isSafeInteger(item.programVersion) &&
    (item.programVersion ?? 0) > 0 &&
    typeof item.sourceDigest === 'string' &&
    digest.test(item.sourceDigest) &&
    typeof item.stageId === 'string' &&
    identifier.test(item.stageId) &&
    Number.isSafeInteger(item.attempt) &&
    (item.attempt ?? 0) > 0 &&
    typeof item.planDigest === 'string' &&
    digest.test(item.planDigest)
  );
}

export function sameGrowthRunIdentity(left: unknown, right: unknown): boolean {
  return (
    isGrowthRunIdentity(left) &&
    isGrowthRunIdentity(right) &&
    identityKeys.every((key) => left[key] === right[key])
  );
}
