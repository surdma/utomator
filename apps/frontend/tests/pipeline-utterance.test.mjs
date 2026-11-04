import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainCommand } from '../components/dashboard/pipeline/command-parser.ts';
import {
  decideUtterance,
  nextCommandState,
} from '../components/dashboard/pipeline/utterance.ts';

test('natural phrases map onto the same four commands', () => {
  assert.equal(explainCommand('check my profile')?.action, 'audit');
  assert.equal(explainCommand('review my LinkedIn.')?.action, 'audit');
  assert.equal(
    explainCommand('change my headline to Clinical Systems Lead')?.fields
      .headline,
    'Clinical Systems Lead',
  );
  assert.equal(
    explainCommand('make my headline Clinical Systems Lead')?.fields.headline,
    'Clinical Systems Lead',
  );
  assert.equal(explainCommand('change my headline to'), null);
  assert.equal(explainCommand('change my headline to .'), null);
  assert.equal(
    explainCommand('add a skill called React')?.fields.skill,
    'React',
  );
  assert.equal(
    explainCommand('add the skill TypeScript')?.fields.skill,
    'TypeScript',
  );
  assert.equal(
    explainCommand('draft a post about New research')?.fields.postText,
    'New research',
  );
  assert.equal(
    explainCommand('write a post saying Hello team')?.fields.postText,
    'Hello team',
  );
  assert.equal(explainCommand('launch everything'), null);
  assert.equal(explainCommand('add a skill called'), null);
});

test('typed exact commands stage immediately and spoken ones wait', () => {
  const typed = decideUtterance(
    'set headline: Clinical Systems Lead',
    'text',
    false,
  );
  assert.equal(typed.kind, 'stage-now');
  const staged = nextCommandState(null, typed);
  assert.equal(staged.stage?.fields.headline, 'Clinical Systems Lead');
  assert.equal(staged.pending, null);

  const spoken = decideUtterance(
    'change my headline to Clinical Systems Lead',
    'voice',
    false,
  );
  assert.equal(spoken.kind, 'needs-confirm');
  const waiting = nextCommandState(null, spoken);
  assert.equal(waiting.stage, null);
  assert.equal(waiting.pending?.action, 'edit-profile');
  assert.match(waiting.reply ?? '', /Nothing is staged until you confirm/);

  const typedNatural = decideUtterance(
    'change my headline to Clinical Systems Lead',
    'text',
    false,
  );
  assert.equal(typedNatural.kind, 'needs-confirm');
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
  assert.equal(confirmed.stage?.action, 'edit-profile');
  assert.equal(confirmed.pending, null);
  assert.match(confirmed.reply ?? '', /No change has been published/);

  const idle = nextCommandState(
    null,
    decideUtterance('go ahead', 'text', false),
  );
  assert.equal(idle.stage, null);
  assert.equal(idle.pending, null);
  assert.match(idle.reply ?? '', /Nothing is waiting/);

  const dropped = nextCommandState(
    waiting.pending,
    decideUtterance('never mind', 'voice', true),
  );
  assert.equal(dropped.stage, null);
  assert.equal(dropped.pending, null);
  assert.match(dropped.reply ?? '', /Dropped/);
});
