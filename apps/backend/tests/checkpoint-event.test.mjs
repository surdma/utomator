import { expect, test } from 'vitest';
import { checkpointEventDetails } from '../src/runs/checkpoint-event.js';

test('compiled YAML task receives the exact checkpoint identity', () => {
  const compiledIds = new Set(['start', 'inspect', 'ownerApproval']);
  expect(checkpointEventDetails('checkpoint-1', 'ownerApproval', compiledIds)).toEqual({
    checkpointId: 'checkpoint-1',
    stepId: 'ownerApproval',
  });
});

test('uncompiled, unknown and missing active steps do not receive task attribution', () => {
  const compiledIds = new Set(['inspect']);
  expect(checkpointEventDetails('checkpoint-1', 'unrelated', compiledIds)).toEqual({
    checkpointId: 'checkpoint-1',
  });
  expect(checkpointEventDetails('checkpoint-1', undefined, compiledIds)).toEqual({
    checkpointId: 'checkpoint-1',
  });
  expect(checkpointEventDetails('checkpoint-1', 'inspect', undefined)).toEqual({
    checkpointId: 'checkpoint-1',
  });
});
