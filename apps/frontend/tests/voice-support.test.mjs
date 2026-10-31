import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVoiceSupport } from '../components/dashboard/pipeline/voice-support.ts';

test('voice support stays unavailable when speech recognition is missing', () => {
  assert.equal(readVoiceSupport(undefined), 'unsupported');
  assert.equal(readVoiceSupport({}), 'unsupported');
  assert.equal(
    readVoiceSupport({ SpeechRecognition: function SpeechRecognition() {} }),
    'ready'
  );
  assert.equal(
    readVoiceSupport({
      webkitSpeechRecognition: function webkitSpeechRecognition() {},
    }),
    'ready'
  );
  assert.equal(
    readVoiceSupport({ SpeechRecognition: 'present' }),
    'unsupported'
  );
});
