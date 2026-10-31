import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchAnnotationAction,
  mergeSpokenComment,
} from '../components/dashboard/reviews/annotation-voice.ts';

const linkedin = ['inspect', 'edit-profile', 'add-skill'];

test('spoken annotation comments pick an allowed action and keep the words', () => {
  assert.equal(
    matchAnnotationAction('add a skill here', linkedin),
    'add-skill'
  );
  assert.equal(
    matchAnnotationAction('edit my headline', linkedin),
    'edit-profile'
  );
  assert.equal(matchAnnotationAction('inspect this spot', linkedin), 'inspect');
  assert.equal(matchAnnotationAction('add a skill here', ['inspect']), null);
  assert.equal(matchAnnotationAction('looks crowded', linkedin), null);
  assert.equal(
    mergeSpokenComment('', 'The headline is vague.'),
    'The headline is vague.'
  );
  assert.equal(
    mergeSpokenComment('Keep the first line.', 'Name the audience.'),
    'Keep the first line. Name the audience.'
  );
  assert.equal(
    mergeSpokenComment('Name the audience.', 'name the audience.'),
    'Name the audience.'
  );
});
