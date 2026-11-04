
import { test, expect } from 'vitest';
import assert from 'node:assert/strict';
import {
  beginQuestionFlow,
  currentQuestion,
  provideQuestionAnswer,
  questionFlowSubmission,
  requiresVisualAnswer,
  spokenQuestionAnswer,
} from '../components/mator/mator-call-questions.ts';

const simple = (name, prompt, more = {}) => ({
  name,
  prompt,
  required: true,
  multiple: false,
  choices: [],
  inputType: 'text',
  ...more,
});

test('multi-question clarification collects answers and posts once at finish', () => {
  let flow = beginQuestionFlow('event-1', [
    simple('name', 'What is your name?'),
    simple('role', 'What role?'),
  ]);
  expect(currentQuestion(flow).name).toEqual('name');
  expect(() => questionFlowSubmission(flow)).toThrow(/not complete/);
  flow = provideQuestionAnswer(flow, ['Ada']);
  expect(currentQuestion(flow).name).toEqual('role');
  flow = provideQuestionAnswer(flow, ['Engineer']);
  expect(currentQuestion(flow)).toEqual(null);
  expect(questionFlowSubmission(flow)).toEqual({
    text: 'What is your name? Ada\nWhat role? Engineer',
    attachmentIds: [],
  });
});
test('structured URL/file/long multiple selections require visual form', () => {
  expect(requiresVisualAnswer(simple('url', 'Provide a URL', { inputType: 'url' }))).toEqual(true);
  expect(requiresVisualAnswer(
      simple('file', 'Attach a file', { inputType: 'file' }),
    )).toEqual(true);
  expect(requiresVisualAnswer(simple('tags', 'Choose tags', { multiple: true }))).toEqual(true);
  expect(requiresVisualAnswer(simple('name', 'Your name?'))).toEqual(false);
});
test('optional questions can be skipped, required questions cannot', () => {
  const flow = beginQuestionFlow('event', [simple('required', 'Name?')]);
  expect(() => provideQuestionAnswer(flow, [])).toThrow(/Answer/);
  const skipped = provideQuestionAnswer(
    beginQuestionFlow('event', [
      simple('optional', 'Extra?', { required: false }),
    ]),
    [],
  );
  expect(questionFlowSubmission(skipped).text).toMatch(/Skipped/);
});
test('spoken choices resolve exact option IDs but no guessed closest match', () => {
  const q = simple('pick', 'Which?', {
    choices: [
      { label: 'Personal', value: 'personal' },
      { label: 'Company', value: 'company' },
    ],
  });
  expect(spokenQuestionAnswer(q, 'company')).toEqual(['company']);
  expect(spokenQuestionAnswer(q, 'PERSONAL')).toEqual(['personal']);
  assert.throws(
    () => spokenQuestionAnswer(q, 'almost company'),
    /didn't recognize/,
  );
});
test('files and URLs validate and preserve attachments', () => {
  let f = beginQuestionFlow('event', [
    simple('link', 'URL?', { inputType: 'url' }),
    simple('file', 'Attach', { inputType: 'file' }),
  ]);
  expect(() => provideQuestionAnswer(f, ['javascript:alert(1)'])).toThrow(/HTTP/);
  f = provideQuestionAnswer(f, ['https://example.com/path']);
  expect(() => provideQuestionAnswer(f, ['plan.pdf'])).toThrow(/Upload/);
  f = provideQuestionAnswer(f, ['plan.pdf'], ['att-1']);
  const sub = questionFlowSubmission(f);
  expect(sub.text).toMatch(/example.com/);
  expect(sub.attachmentIds).toEqual(['att-1']);
});
test('invalid or duplicate question identity is rejected', () => {
  expect(() => beginQuestionFlow('e', [simple('x', 'A'), simple('x', 'B')])).toThrow(/distinct/);
  expect(() => beginQuestionFlow('', [simple('a', 'A')])).toThrow(/distinct/);
});
test('visual choice answers cannot submit values outside the allowed options', () => {
  const flow = beginQuestionFlow('event', [
    simple('choice', 'Choose an option', {
      choices: [{ value: 'one', label: 'One' }],
    }),
  ]);
  expect(() => provideQuestionAnswer(flow, ['fake'])).toThrow(/listed options/);
});
