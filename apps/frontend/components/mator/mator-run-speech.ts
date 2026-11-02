import type { Event as RunEvent } from '../dashboard/pipeline/run-models';

/**
 * Convert only real Runner stream records into short spoken updates.
 * A raw error event can contain private backend details, so we never read it aloud.
 */
export function summarizeRunEventForSpeech(event: RunEvent): string | null {
  const message = event.message.trim();
  if (event.kind === 'approval') return 'The workflow needs your approval.';
  if (event.kind === 'input') return 'The workflow needs more information.';
  if (event.kind === 'error')
    return 'The workflow needs attention. Open the run details for more information.';
  if (event.kind === 'step') {
    if (message.startsWith('Started: '))
      return 'Step started: ' + message.slice(9, 110) + '.';
    if (message.startsWith('Completed: '))
      return 'Step completed: ' + message.slice(11, 110) + '.';
    if (message.startsWith('Failed: '))
      return 'A workflow step failed. Open its details to review the cause.';
    return null;
  }
  if (event.kind !== 'status') return null;
  if (message === 'Run queued for browser startup')
    return 'The workflow is starting.';
  if (message.startsWith('Run paused')) return 'The workflow is paused.';
  if (message.startsWith('Run resumed')) return 'The workflow has resumed.';
  if (message === 'Run finished with verified steps')
    return 'The workflow finished with its steps verified.';
  if (
    message.startsWith('Run ended: failed') ||
    message.startsWith('Run ended: blocked')
  ) {
    return 'The workflow could not finish. Open the run details to see why.';
  }
  if (message.startsWith('Run ended: cancelled'))
    return 'The workflow was cancelled.';
  return null;
}

/**
 * Consume each real event ID only once, even when voice is switched off.
 * Replay history is seeded by the owning hook before this is called.
 */
export function collectRunSpeechUpdates(
  events: RunEvent[],
  runId: string,
  seen: Set<number>
): string[] {
  const updates: string[] = [];
  for (const event of events) {
    if (event.runId !== runId || seen.has(event.id)) continue;
    seen.add(event.id);
    const spoken = summarizeRunEventForSpeech(event);
    if (spoken) updates.push(spoken);
  }
  return updates;
}
