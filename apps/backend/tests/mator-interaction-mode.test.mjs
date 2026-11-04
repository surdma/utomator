import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mayAutoApproveMatorAction,
  parseMatorInteractionMode,
} from '../src/mator/mator-interaction-mode.ts';

test('legacy text messages retain global approval policy', () => {
  assert.equal(parseMatorInteractionMode(undefined), 'text');
  assert.equal(mayAutoApproveMatorAction(true, 'text'), true);
  assert.equal(mayAutoApproveMatorAction(false, 'text'), false);
});
test('AI Call always stages even when autoApprove is on', () => {
  assert.equal(parseMatorInteractionMode('ai_call'), 'ai_call');
  assert.equal(mayAutoApproveMatorAction(true, 'ai_call'), false);
  assert.equal(mayAutoApproveMatorAction(false, 'ai_call'), false);
});
test('unknown/invalid call mode is rejected, not silently treated as text', () => {
  for (const mode of ['call', 'AI_CALL', null, true, 0, {}]) {
    assert.throws(() => parseMatorInteractionMode(mode), /interactionMode/);
  }
});
