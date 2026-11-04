const ACTION_PATTERNS: Array<{ action: string; pattern: RegExp }> = [
  { action: 'add-skill', pattern: /\badd(?:\s+(?:a|the))?\s+skill\b/i },
  {
    action: 'edit-profile',
    pattern: /\bedit\s+(?:my\s+)?(?:headline|profile)\b/i,
  },
  { action: 'inspect', pattern: /\binspect\b/i },
];

export function matchAnnotationAction(
  utterance: string,
  allowed: readonly string[],
) {
  const found = ACTION_PATTERNS.find((item) => item.pattern.test(utterance));
  if (!found || !allowed.includes(found.action)) return null;
  return found.action;
}

export function mergeSpokenComment(current: string, utterance: string) {
  const next = utterance.trim();
  if (!next) return current;
  const existing = current.trim();
  if (!existing) return next;
  if (existing.toLowerCase().includes(next.toLowerCase())) return existing;
  return `${existing} ${next}`;
}
