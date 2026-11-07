import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AGENTS.md', () => {
  const text = readFileSync(path.resolve('../../AGENTS.md'), 'utf8');

  it('names the real test runner and the layer rule', () => {
    expect(text).toContain('vitest');
    expect(text).toContain('tests/unit/**');
    expect(text).toContain('tests/feature/**');
    expect(text).toContain('domain');
    expect(text).toContain('DESIGN.md');
  });

  it('does not keep stale control rules', () => {
    expect(text).not.toContain('node --test');
    expect(text).not.toMatch(/Prettier/);
    expect(text).not.toContain('components/automate');
    expect(text).not.toContain('components/dashboard/');
  });
});
