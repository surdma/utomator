import type { EventJournal } from './events.js';
import type { RunSummary } from './types.js';

export interface Comparison {
  field: string;
  observed: string | null;
  proposed: string | null;
  status: 'not-observed' | 'matches-draft' | 'review-candidate' | 'observed-only';
  source: string;
}

// Only compare fields present in actual browser audit events. An archived
// screenshot or a proposed copy block must never be treated as live state.
export function assessAudit(
  journal: EventJournal, run: RunSummary, proposedHeadline: string | null,
) {
  const events = journal.getSince(0, run.id);
  const audit = events.find((event) => event.kind === 'audit' &&
    event.details && typeof event.details === 'object' && 'headline' in event.details);
  const details = audit?.details as { headline?: unknown; bio?: unknown; url?: unknown } | undefined;
  const observed = run.platform === 'linkedin'
    ? (typeof details?.headline === 'string' ? details.headline.trim() : null)
    : (typeof details?.bio === 'string' ? details.bio.trim() : null);
  const proposed = run.platform === 'linkedin' ? proposedHeadline : null;
  const status = observed === null ? 'not-observed' :
    !proposed ? 'observed-only' :
    observed === proposed ? 'matches-draft' : 'review-candidate';
  const result: Comparison = {
    field: run.platform === 'linkedin' ? 'headline' : 'bio',
    observed,
    proposed,
    status,
    source: proposed ? 'apps/frontend/docs/linkedin-profile-optimization.md' : 'Live browser audit',
  };
  return {
    runId: run.id,
    platform: run.platform,
    runState: run.state,
    observations: events.filter((event) => event.kind === 'audit').length,
    comparisons: [result],
    notice: 'A difference from a draft is not an error. The owner must review it before making changes.',
  };
}
