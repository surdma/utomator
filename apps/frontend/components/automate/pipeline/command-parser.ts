export function explainCommand(
  value: string
): { action: string; fields: Record<string, string>; note: string } | null {
  const text = value.trim();
  if (/^(audit|inspect|review)(?:\s+(?:my\s+)?profile)?[.!]?$/i.test(text)) {
    return {
      action: 'audit',
      fields: {},
      note: 'Read-only audit prepared. Start the run to collect current profile evidence.',
    };
  }
  const headline = text.match(
    /^(?:set|update|draft)\s+(?:my\s+)?headline\s*:\s*([\s\S]+)$/i
  );
  if (headline)
    return {
      action: 'edit-profile',
      fields: { headline: headline[1].trim() },
      note: 'Headline staged for review. No change has been published.',
    };
  const skill = text.match(/^(?:add)\s+(?:the\s+)?skill\s*:\s*([\s\S]+)$/i);
  if (skill)
    return {
      action: 'add-skill',
      fields: { skill: skill[1].trim() },
      note: 'Skill selected. LinkedIn will confirm the exact catalog entry.',
    };
  const post = text.match(
    /^(?:draft|compose)\s+(?:a\s+)?post\s*:\s*([\s\S]+)$/i
  );
  if (post)
    return {
      action: 'compose-post',
      fields: { postText: post[1].trim() },
      note: 'Post staged. Publishing still requires your explicit approval.',
    };
  return null;
}

