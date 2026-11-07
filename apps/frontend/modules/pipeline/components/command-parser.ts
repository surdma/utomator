export type ParsedCommand = {
  action: string;
  fields: Record<string, string>;
  note: string;
};

const AUDIT_NOTE =
  'Read-only audit prepared. Start the run to collect current profile evidence.';
const HEADLINE_NOTE =
  'Headline staged for review. No change has been published.';
const SKILL_NOTE =
  'Skill selected. LinkedIn will confirm the exact catalog entry.';
const POST_NOTE =
  'Post staged. Publishing still requires your explicit approval.';

function spokenValue(value: string) {
  const cleaned = value
    .trim()
    .replace(/^to\s+/i, '')
    .replace(/^[:-]\s*/, '')
    .trim();
  if (!cleaned || /^(?:called|named)$/i.test(cleaned)) return null;
  return cleaned;
}

function matchLegacy(text: string): ParsedCommand | null {
  if (/^(audit|inspect|review)(?:\s+(?:my\s+)?profile)?[.!]?$/i.test(text)) {
    return { action: 'audit', fields: {}, note: AUDIT_NOTE };
  }
  const headline = text.match(
    /^(?:set|update|draft)\s+(?:my\s+)?headline\s*:\s*([\s\S]+)$/i,
  );
  if (headline) {
    return {
      action: 'edit-profile',
      fields: { headline: headline[1].trim() },
      note: HEADLINE_NOTE,
    };
  }
  const skill = text.match(/^(?:add)\s+(?:the\s+)?skill\s*:\s*([\s\S]+)$/i);
  if (skill) {
    return {
      action: 'add-skill',
      fields: { skill: skill[1].trim() },
      note: SKILL_NOTE,
    };
  }
  const post = text.match(
    /^(?:draft|compose)\s+(?:a\s+)?post\s*:\s*([\s\S]+)$/i,
  );
  if (post) {
    return {
      action: 'compose-post',
      fields: { postText: post[1].trim() },
      note: POST_NOTE,
    };
  }
  return null;
}

function matchNatural(text: string): ParsedCommand | null {
  if (
    /^(?:check|review|audit)\s+(?:my\s+)?linkedin$/i.test(text) ||
    /^check\s+(?:my\s+)?profile$/i.test(text)
  ) {
    return { action: 'audit', fields: {}, note: AUDIT_NOTE };
  }
  const headline = text.match(
    /^(?:change|set|update)\s+(?:my\s+)?headline\s+to\s+([\s\S]+)$/i,
  );
  const madeHeadline = headline
    ? null
    : text.match(/^(?:make)\s+(?:my\s+)?headline\s+([\s\S]+)$/i);
  const headlineValue = spokenValue((headline ?? madeHeadline)?.[1] ?? '');
  if ((headline || madeHeadline) && headlineValue) {
    return {
      action: 'edit-profile',
      fields: { headline: headlineValue },
      note: HEADLINE_NOTE,
    };
  }
  if (headline || madeHeadline) return null;
  const skill = text.match(
    /^(?:add)\s+(?:(?:a|the)\s+)?skill(?:\s+(?:called|named))?\s+([\s\S]+)$/i,
  );
  if (skill) {
    const value = spokenValue(skill[1]);
    if (!value) return null;
    return {
      action: 'add-skill',
      fields: { skill: value },
      note: SKILL_NOTE,
    };
  }
  const post = text.match(
    /^(?:draft|write|compose)\s+(?:a\s+)?post\s+(?:about|saying)\s+([\s\S]+)$/i,
  );
  if (post) {
    const value = spokenValue(post[1]);
    if (!value) return null;
    return {
      action: 'compose-post',
      fields: { postText: value },
      note: POST_NOTE,
    };
  }
  return null;
}

export function explainCommand(value: string): ParsedCommand | null {
  const text = value.trim();
  if (!text) return null;
  return matchLegacy(text) ?? matchNatural(text.replace(/[.!?]+$/g, '').trim());
}

export function isLegacyExact(value: string) {
  const text = value.trim();
  return text.length > 0 && matchLegacy(text) !== null;
}
