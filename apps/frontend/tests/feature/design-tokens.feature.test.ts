import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DESIGN.md tokens', () => {
  it('keeps the operator light palette in globals.css', () => {
    const css = readFileSync(path.resolve('app/globals.css'), 'utf8');
    const design = readFileSync(path.resolve('../../DESIGN.md'), 'utf8');
    for (const token of [
      '#f5f7f8',
      '#ffffff',
      '#e2e8f0',
      '#0f172a',
      '#475569',
      '#64748b',
      '#06b6d4',
      '#8b5cf6',
      '#ec4899',
    ]) {
      expect(css).toContain(token);
      expect(design).toContain(token);
    }
    expect(design).toContain('color-scheme: light');
    expect(design).toContain('prefers-reduced-motion');
    expect(css).toContain('prefers-reduced-motion');
  });
});
