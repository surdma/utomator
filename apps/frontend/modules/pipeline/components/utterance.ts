import {
  explainCommand,
  isLegacyExact,
  type ParsedCommand,
} from './command-parser.ts';

export type UtteranceSource = 'voice' | 'text';

export type UtteranceDecision =
  | { kind: 'ignore' }
  | { kind: 'confirm-pending' }
  | { kind: 'cancel-pending'; reply: string }
  | { kind: 'nothing-pending'; reply: string }
  | { kind: 'craft' }
  | { kind: 'memory' }
  | { kind: 'inspect-page' }
  | { kind: 'stage-now'; command: ParsedCommand }
  | { kind: 'needs-confirm'; command: ParsedCommand; reply: string }
  | { kind: 'unknown'; reply: string };

const CONFIRM = /^(?:stage it|stage this|go ahead)$/i;
const CANCEL = /^(?:cancel|never mind|nevermind)$/i;
const UNKNOWN =
  'I can audit a profile, change a headline, add a skill, or draft a post. Say it in your own words.';
const IDLE = 'Nothing is waiting to be staged.';

function phrase(value: string) {
  return value
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
}

function quote(value: string) {
  return `'${value}'`;
}

export function hearingReply(command: ParsedCommand) {
  if (command.fields.headline) {
    return `I heard a new headline: ${quote(command.fields.headline)}. Nothing is staged until you confirm. No change is published until you approve it.`;
  }
  if (command.fields.skill) {
    return `I heard a skill: ${quote(command.fields.skill)}. Nothing is staged until you confirm. LinkedIn will still confirm the exact catalog entry.`;
  }
  if (command.fields.postText) {
    return `I heard a post: ${quote(command.fields.postText)}. Nothing is staged until you confirm. Publishing still needs your explicit approval.`;
  }
  return 'I heard an audit. Nothing is staged until you confirm. The run stays read-only until you start it.';
}

export function pendingCommandLabel(command: ParsedCommand) {
  if (command.fields.headline || command.action === 'edit-profile')
    return 'headline';
  if (command.fields.skill || command.action === 'add-skill') return 'skill';
  if (command.fields.postText || command.action === 'compose-post')
    return 'post';
  return 'audit';
}

export function decideUtterance(
  value: string,
  source: UtteranceSource,
  hasPending: boolean,
): UtteranceDecision {
  const request = value.trim();
  if (!request) return { kind: 'ignore' };
  const spoken = phrase(request);
  if (CONFIRM.test(spoken)) {
    return hasPending
      ? { kind: 'confirm-pending' }
      : { kind: 'nothing-pending', reply: IDLE };
  }
  if (CANCEL.test(spoken)) {
    return hasPending
      ? { kind: 'cancel-pending', reply: 'Dropped. Nothing was staged.' }
      : { kind: 'nothing-pending', reply: IDLE };
  }
  if (/^(?:\/?craft(?:\s|$)|crafts$)/i.test(request)) return { kind: 'craft' };
  if (/^(what do you remember\??|show memory|memory)$/i.test(spoken)) {
    return { kind: 'memory' };
  }
  if (/^(inspect this page|audit this page)$/i.test(spoken)) {
    return { kind: 'inspect-page' };
  }
  const command = explainCommand(request);
  if (!command) return { kind: 'unknown', reply: UNKNOWN };
  if (source === 'text' && isLegacyExact(request)) {
    return { kind: 'stage-now', command };
  }
  return { kind: 'needs-confirm', command, reply: hearingReply(command) };
}

export function nextCommandState(
  pending: ParsedCommand | null,
  decision: UtteranceDecision,
): {
  pending: ParsedCommand | null;
  stage: ParsedCommand | null;
  reply: string | null;
} {
  switch (decision.kind) {
    case 'ignore':
    case 'craft':
    case 'memory':
    case 'inspect-page':
      return { pending, stage: null, reply: null };
    case 'confirm-pending':
      if (!pending) return { pending: null, stage: null, reply: IDLE };
      return { pending: null, stage: pending, reply: pending.note };
    case 'cancel-pending':
      return { pending: null, stage: null, reply: decision.reply };
    case 'nothing-pending':
      return { pending, stage: null, reply: decision.reply };
    case 'stage-now':
      return {
        pending: null,
        stage: decision.command,
        reply: decision.command.note,
      };
    case 'needs-confirm':
      return {
        pending: decision.command,
        stage: null,
        reply: decision.reply,
      };
    case 'unknown':
      return { pending, stage: null, reply: decision.reply };
  }
}
