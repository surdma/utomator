
import { test, expect } from 'vitest';
import { MatorCallCoordinator } from '../components/mator/mator-call-coordinator.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(pred) {
  for (let i = 0; i < 300; i++) {
    if (pred()) return;
    await tick();
  }
  throw new Error('expected phase/result');
}
const question = (name, prompt, extra = {}) => ({
  name,
  prompt,
  required: true,
  multiple: false,
  choices: [],
  inputType: 'text',
  ...extra,
});
const reply = (text) => ({
  reply: text,
  requiresAttention: false,
  eventIds: [],
});
const details = {
  capture: async () => new Blob(['voice']),
  transcribe: async () => '',
  respond: async () => reply('ok'),
  speak: async () => null,
  stopOutput: () => {},
  onState: () => {},
};

test('spoken clarification asks each question separately but persists one final answer', async () => {
  const prompts = [],
    posted = [],
    spoke = [];
  let audio = 0;
  const stopper = new Promise(() => {});
  const call = new MatorCallCoordinator({
    ...details,
    capture: () =>
      ++audio <= 3 ? Promise.resolve(new Blob([`voice${audio}`])) : stopper,
    transcribe: async () => ['initial', 'Ada', 'Engineer'][audio - 1],
    respond: async (text) => {
      posted.push(text);
      return posted.length === 1
        ? {
            reply: '',
            requiresAttention: true,
            eventIds: ['e'],
            clarification: {
              eventId: 'clarify-e',
              questions: [
                question('name', 'Your name?'),
                question('role', 'Your role?'),
              ],
            },
          }
        : reply('Thanks, Ada');
    },
    speak: async (text) => {
      spoke.push(text);
      return null;
    },
    onQuestion: (q) => {
      if (q) prompts.push(q.prompt);
    },
  });
  call.start('workflow:thread');
  await until(() => posted.length === 2);
  expect(posted).toEqual(['initial', 'Your name? Ada\nYour role? Engineer']);
  expect(prompts).toEqual(['Your name?', 'Your role?']);
  await until(() => spoke.includes('Thanks, Ada'));
  call.end();
});

test('visual URL clarification remains paused until submitted then automatically resumes', async () => {
  const requests = [];
  let captureCalls = 0;
  const blocked = new Promise(() => {});
  const call = new MatorCallCoordinator({
    ...details,
    capture: () =>
      ++captureCalls === 1 ? Promise.resolve(new Blob(['initial'])) : blocked,
    transcribe: async () => 'Please update my profile',
    respond: async (text) => {
      requests.push(text);
      return requests.length === 1
        ? {
            reply: '',
            requiresAttention: true,
            eventIds: ['clarify'],
            clarification: {
              eventId: 'clarify',
              questions: [question('url', 'Enter a URL', { inputType: 'url' })],
            },
          }
        : reply('Got the link.');
    },
  });
  call.start('workflow:thread');
  await until(() => call.phase === 'clarifying-form');
  expect(captureCalls).toEqual(1);
  await call.answerVisual(['https://example.com']);
  await until(() => requests.length === 2);
  expect(requests[1]).toEqual('Enter a URL https://example.com/');
  await until(() => captureCalls === 2);
  call.end();
});

test('staged action never continues until matching on-screen decision succeeded', async () => {
  let captures = 0;
  const idle = new Promise(() => {});
  const call = new MatorCallCoordinator({
    ...details,
    capture: () =>
      ++captures === 1 ? Promise.resolve(new Blob(['voice'])) : idle,
    transcribe: async () => 'Change workflow',
    respond: async () => ({
      reply: '',
      requiresAttention: true,
      eventIds: ['stage'],
      stagedEventIds: ['stage'],
    }),
  });
  call.start('workflow:thread');
  await until(() => call.phase === 'awaiting-approval');
  expect(captures).toEqual(1);
  await call.stageDecisionSucceeded('wrong-stage', 'confirm');
  expect(call.phase).toEqual('awaiting-approval');
  await call.stageDecisionSucceeded('stage', 'reject');
  await until(() => captures === 2);
  call.end();
});

test('microphone mute prevents automatic resumption after staged decision', async () => {
  let captures = 0;
  const call = new MatorCallCoordinator({
    ...details,
    capture: async () => {
      captures++;
      return new Blob(['audio']);
    },
    transcribe: async () => 'modify',
    respond: async () => ({
      reply: '',
      requiresAttention: true,
      eventIds: ['stage'],
      stagedEventIds: ['stage'],
    }),
  });
  call.start('workflow:thread');
  await until(() => call.phase === 'awaiting-approval');
  call.setMicMuted(true);
  await call.stageDecisionSucceeded('stage', 'confirm');
  expect(captures).toEqual(1);
  expect(call.phase).toEqual('paused');
  call.end();
});

test('genuine barge audio is transcribed as the next turn with no new microphone tap', async () => {
  let captures = 0,
    transcripts = [],
    messages = [],
    countsAtSend = [],
    speech = 0;
  const blocked = new Promise(() => {});
  const call = new MatorCallCoordinator({
    ...details,
    capture: () =>
      ++captures === 1 ? Promise.resolve(new Blob(['first'])) : blocked,
    transcribe: async (audio) => {
      const text = await audio.text();
      transcripts.push(text);
      return text;
    },
    respond: async (text) => {
      messages.push(text);
      countsAtSend.push(captures);
      return reply(`Answer ${text}`);
    },
    speak: async () => (++speech === 1 ? new Blob(['barge-in']) : null),
  });
  call.start('workflow:thread');
  await until(() => messages.length === 2);
  expect(messages).toEqual(['first', 'barge-in']);
  expect(countsAtSend).toEqual([1, 1]);
  call.end();
});

test('structured answer submitted while microphone muted stays paused without voice capture', async () => {
  let captures = 0;
  const pending = new Promise(() => {});
  const call = new MatorCallCoordinator({
    ...details,
    capture: () =>
      ++captures === 1 ? Promise.resolve(new Blob(['start'])) : pending,
    transcribe: async () => 'request with URL',
    respond: async () => ({
      reply: '',
      requiresAttention: true,
      eventIds: ['clarify'],
      clarification: {
        eventId: 'clarify',
        questions: [question('url', 'Website?', { inputType: 'url' })],
      },
    }),
  });
  call.start('w:t');
  await until(() => call.phase === 'clarifying-form');
  call.setMicMuted(true);
  await call.answerVisual(['https://example.org']);
  expect(call.phase).toEqual('paused');
  expect(captures).toEqual(1);
  call.end();
});
