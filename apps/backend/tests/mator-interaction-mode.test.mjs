import { expect, test } from 'vitest';
import {
  mayAutoApproveMatorAction,
  parseMatorInteractionMode,
} from '../src/infrastructure/mator/mator-interaction-mode.ts';

test('legacy text messages retain global approval policy', () => {
  expect(parseMatorInteractionMode(undefined)).toEqual('text');
  expect(mayAutoApproveMatorAction(true, 'text')).toEqual(true);
  expect(mayAutoApproveMatorAction(false, 'text')).toEqual(false);
});
test('AI Call always stages even when autoApprove is on', () => {
  expect(parseMatorInteractionMode('ai_call')).toEqual('ai_call');
  expect(mayAutoApproveMatorAction(true, 'ai_call')).toEqual(false);
  expect(mayAutoApproveMatorAction(false, 'ai_call')).toEqual(false);
});
test('unknown/invalid call mode is rejected, not silently treated as text', () => {
  for (const mode of ['call', 'AI_CALL', null, true, 0, {}]) {
    expect(() => parseMatorInteractionMode(mode)).toThrow(/interactionMode/);
  }
});
