import { expect, test } from 'vitest';
import { explainCommand } from '../modules/pipeline/components/command-parser.ts';
import {
  decideUtterance,
  nextCommandState,
} from '../modules/pipeline/components/utterance.ts';

test('natural phrases map onto the same four commands', () => {
  expect(explainCommand('check my profile')?.action).toEqual('audit');
  expect(explainCommand('review my LinkedIn.')?.action).toEqual('audit');
  expect(
    explainCommand('change my headline to Clinical Systems Lead')?.fields
      .headline,
  ).toEqual('Clinical Systems Lead');
  expect(
    explainCommand('make my headline Clinical Systems Lead')?.fields.headline,
  ).toEqual('Clinical Systems Lead');
  expect(explainCommand('change my headline to')).toEqual(null);
  expect(explainCommand('change my headline to .')).toEqual(null);
  expect(explainCommand('add a skill called React')?.fields.skill).toEqual(
    'React',
  );
  expect(explainCommand('add the skill TypeScript')?.fields.skill).toEqual(
    'TypeScript',
  );
  expect(
    explainCommand('draft a post about New research')?.fields.postText,
  ).toEqual('New research');
  expect(
    explainCommand('write a post saying Hello team')?.fields.postText,
  ).toEqual('Hello team');
  expect(explainCommand('launch everything')).toEqual(null);
  expect(explainCommand('add a skill called')).toEqual(null);
});

test('typed exact commands stage immediately and spoken ones wait', () => {
  const typed = decideUtterance(
    'set headline: Clinical Systems Lead',
    'text',
    false,
  );
  expect(typed.kind).toEqual('stage-now');
  const staged = nextCommandState(null, typed);
  expect(staged.stage?.fields.headline).toEqual('Clinical Systems Lead');
  expect(staged.pending).toEqual(null);

  const spoken = decideUtterance(
    'change my headline to Clinical Systems Lead',
    'voice',
    false,
  );
  expect(spoken.kind).toEqual('needs-confirm');
  const waiting = nextCommandState(null, spoken);
  expect(waiting.stage).toEqual(null);
  expect(waiting.pending?.action).toEqual('edit-profile');
  expect(waiting.reply ?? '').toMatch(/Nothing is staged until you confirm/);

  const typedNatural = decideUtterance(
    'change my headline to Clinical Systems Lead',
    'text',
    false,
  );
  expect(typedNatural.kind).toEqual('needs-confirm');
});

test('confirm stages the pending command and does nothing when none is waiting', () => {
  const heard = decideUtterance(
    'change my headline to Clinical Systems Lead',
    'voice',
    false,
  );
  const waiting = nextCommandState(null, heard);
  const confirmed = nextCommandState(
    waiting.pending,
    decideUtterance('stage it', 'voice', true),
  );
  expect(confirmed.stage?.action).toEqual('edit-profile');
  expect(confirmed.pending).toEqual(null);
  expect(confirmed.reply ?? '').toMatch(/No change has been published/);

  const idle = nextCommandState(
    null,
    decideUtterance('go ahead', 'text', false),
  );
  expect(idle.stage).toEqual(null);
  expect(idle.pending).toEqual(null);
  expect(idle.reply ?? '').toMatch(/Nothing is waiting/);

  const dropped = nextCommandState(
    waiting.pending,
    decideUtterance('never mind', 'voice', true),
  );
  expect(dropped.stage).toEqual(null);
  expect(dropped.pending).toEqual(null);
  expect(dropped.reply ?? '').toMatch(/Dropped/);
});
