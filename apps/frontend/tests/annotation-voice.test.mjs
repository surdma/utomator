
import { test, expect } from 'vitest';
import {
  matchAnnotationAction,
  mergeSpokenComment,
} from '../components/dashboard/reviews/annotation-voice.ts';

const linkedin = ['inspect', 'edit-profile', 'add-skill'];

test('spoken annotation comments pick an allowed action and keep the words', () => {
  expect(matchAnnotationAction('add a skill here', linkedin)).toEqual('add-skill');
  expect(matchAnnotationAction('edit my headline', linkedin)).toEqual('edit-profile');
  expect(matchAnnotationAction('inspect this spot', linkedin)).toEqual('inspect');
  expect(matchAnnotationAction('add a skill here', ['inspect'])).toEqual(null);
  expect(matchAnnotationAction('looks crowded', linkedin)).toEqual(null);
  expect(mergeSpokenComment('', 'The headline is vague.')).toEqual('The headline is vague.');
  expect(mergeSpokenComment('Keep the first line.', 'Name the audience.')).toEqual('Keep the first line. Name the audience.');
  expect(mergeSpokenComment('Name the audience.', 'name the audience.')).toEqual('Name the audience.');
});
