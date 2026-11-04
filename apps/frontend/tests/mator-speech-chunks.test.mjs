
import { test, expect } from 'vitest';
import {
  chunkMatorSpeech,
  playMatorSpeechChunks,
} from '../components/mator/mator-speech-chunks.ts';

test('short speech and empty input', () => {
  expect(chunkMatorSpeech('Pipeline started.')).toEqual([
    'Pipeline started.',
  ]);
  expect(chunkMatorSpeech('   ')).toEqual([]);
});
test('long speech preserves words and provider limit', () => {
  const text = Array.from({ length: 70 }, (_, i) => `Task ${i} checked.`).join(
    ' ',
  );
  const parts = chunkMatorSpeech(text);
  expect(parts.length > 2).toBeTruthy();
  expect(parts.every((s) => s.length <= 190)).toBeTruthy();
  expect(parts.join(' ')).toEqual(text);
});
test('emoji not split into surrogate halves', () => {
  const emoji = '🏁'.repeat(121);
  const chunks = chunkMatorSpeech(emoji);
  expect(chunks.join('')).toEqual(emoji);
  expect(chunks.every((s) => s.length <= 190 && !/[\uD800-\uDBFF]$/.test(s))).toBeTruthy();
});
test('invalid limits are rejected', () => {
  for (const n of [0, 12, 201, 99.5])
    expect(() => chunkMatorSpeech('abc', n)).toThrow(RangeError);
});
test('Groq speech synthesis and playback run sequentially', async () => {
  const order = [];
  await playMatorSpeechChunks('An update has started. '.repeat(19), {
    synthesize: async (text) => {
      expect(text.length <= 190).toBeTruthy();
      order.push('synth');
      return new Blob([text]);
    },
    play: async () => {
      order.push('play');
    },
    fallback: () => {
      throw Error('unexpected fallback');
    },
    isCancelled: () => false,
  });
  expect(order.length >= 4).toBeTruthy();
  expect(order.every((x, i) => x === (i % 2 === 0 ? 'synth' : 'play'))).toBeTruthy();
});
test('Groq errors fall back only for unplayed text', async () => {
  const text = 'One sentence. '.repeat(45);
  let calls = 0,
    remainder = '';
  await playMatorSpeechChunks(text, {
    synthesize: async (part) => {
      if (++calls === 2) throw Error('Groq 429');
      return new Blob([part]);
    },
    play: async () => {},
    fallback: (s) => {
      remainder = s;
    },
    isCancelled: () => false,
  });
  expect(calls).toEqual(2);
  expect(remainder).toEqual(chunkMatorSpeech(text).slice(1).join(' '));
});
test('cancellation prevents both playback and fallback', async () => {
  let cancelled = false,
    played = 0,
    fallen = 0;
  await playMatorSpeechChunks('Ready.', {
    synthesize: async () => {
      cancelled = true;
      return new Blob(['audio']);
    },
    play: async () => {
      played++;
    },
    fallback: () => {
      fallen++;
    },
    isCancelled: () => cancelled,
  });
  expect(played).toEqual(0);
  expect(fallen).toEqual(0);
});
test('playback errors trigger the browser fallback', async () => {
  let spoken = '';
  await playMatorSpeechChunks('Ready.', {
    synthesize: async (text) => new Blob([text]),
    play: async () => {
      throw Error('Autoplay blocked');
    },
    fallback: (text) => {
      spoken = text;
    },
    isCancelled: () => false,
  });
  expect(spoken).toEqual('Ready.');
});
