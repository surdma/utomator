/**
 * Attribute a live operator checkpoint only to the step executing in the
 * pinned compiled plan. A legacy action or unknown step has no task identity.
 */
export function checkpointEventDetails(
  checkpointId: string,
  currentStepId: string | undefined,
  compiledStepIds: ReadonlySet<string> | undefined,
): { checkpointId: string; stepId?: string } {
  return currentStepId && compiledStepIds?.has(currentStepId)
    ? { checkpointId, stepId: currentStepId }
    : { checkpointId };
}
