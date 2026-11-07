import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend module entries', () => {
  it('declares a public index for each required module', () => {
    const modules = [
      'career',
      'connections',
      'crafts',
      'editorial',
      'growth',
      'intelligence',
      'pipeline',
      'research',
      'reviews',
      'settings',
      'workflows',
      'mator',
      'shell',
    ];
    for (const name of modules) {
      const indexPath = path.resolve('modules', name, 'index.ts');
      expect(existsSync(indexPath), indexPath).toBe(true);
      const source = readFileSync(indexPath, 'utf8');
      expect(source.length).toBeGreaterThan(0);
    }
  });
});
