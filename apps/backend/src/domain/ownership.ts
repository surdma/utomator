const ownerPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Shape validation does not authenticate a caller; the composition root supplies this value. */
export function isTrustedOwnerId(principal: unknown): principal is string {
  return typeof principal === 'string' && (principal === 'local-owner' || ownerPattern.test(principal));
}

/** Missing historical ownership is unknown, never permission to claim an artifact. */
export function isOwnedBy(resource: { ownerId?: unknown }, principal: unknown): boolean {
  return isTrustedOwnerId(principal) && resource.ownerId === principal;
}
