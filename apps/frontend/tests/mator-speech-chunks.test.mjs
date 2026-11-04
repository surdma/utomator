import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chunkMatorSpeech,
  playMatorSpeechChunks,
} from '../components/mator/mator-speech-chunks.ts';

test('short speech and empty input', () => {
  assert.deepEqual(chunkMatorSpeech('Pipeline started.'), [
    'Pipeline started.',
  ]);
  assert.deepEqual(chunkMatorSpeech('   '), []);
});
test('long speech preserves words and provider limit', () => {
  const text = Array.from({ length: 70 }, (_, i) => `Task ${i} checked.`).join(
    ' ',
  );
  const parts = chunkMatorSpeech(text);
  assert.ok(parts.length > 2);
  assert.ok(parts.every((s) => s.length <= 190));
  assert.equal(parts.join(' '), text);
});
test('emoji not split into surrogate halves', () => {
  const emoji = '🏁'.repeat(121);
  const chunks = chunkMatorSpeech(emoji);
  assert.equal(chunks.join(''), emoji);
  assert.ok(
    chunks.every((s) => s.length <= 190 && !/[\uD800-\uDBFF]$/.test(s)),
  );
});
test('invalid limits are rejected', () => {
  for (const n of [0, 12, 201, 99.5])
    assert.throws(() => chunkMatorSpeech('abc', n), RangeError);
});
test('Groq speech synthesis and playback run sequentially', async () => {
  const order = [];
  await playMatorSpeechChunks('An update has started. '.repeat(19), {
    synthesize: async (text) => {
      assert.ok(text.length <= 190);
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
  assert.ok(order.length >= 4);
  assert.ok(order.every((x, i) => x === (i % 2 === 0 ? 'synth' : 'play')));
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
  assert.equal(calls, 2);
  assert.equal(remainder, chunkMatorSpeech(text).slice(1).join(' '));
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
  assert.equal(played, 0);
  assert.equal(fallen, 0);
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
  assert.equal(spoken, 'Ready.');
});
