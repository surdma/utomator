import { describe, expect, it } from 'vitest';
import { linkedinPipeline } from '../../src/domain/workflow-plan.js';
import { readGrowthTemplate } from '../../src/infrastructure/growth/growth-profile.js';
import { Runner } from '../../src/infrastructure/runs/runner.js';

describe('use case homes', () => {
  it('keeps the runner and the linear workflow plan', () => {
    expect(typeof Runner).toBe('function');
    expect(typeof linkedinPipeline).toBe('function');
  });

  it('still reads Growth YAML from apps/backend/growth', async () => {
    const template = await readGrowthTemplate('linkedin-profile');
    expect(template?.program.id).toBe('linkedin-profile');
  });
});
