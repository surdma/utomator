import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const modulesRoot = path.resolve('modules');

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('frontend module boundaries', () => {
  it('crosses modules only through the public index', async () => {
    const violations: string[] = [];
    for (const file of await walk(modulesRoot)) {
      const source = await readFile(file, 'utf8');
      const from = path.relative(modulesRoot, file).split(path.sep)[0];
      const dir = path.dirname(file);
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        let target: string | null = null;
        if (spec.startsWith('@/modules/')) target = spec.split('/')[2] ?? null;
        else if (spec.startsWith('.')) {
          const resolved = path.resolve(dir, spec).replaceAll('\\', '/');
          const marker = '/modules/';
          const index = resolved.lastIndexOf(marker);
          if (index >= 0)
            target =
              resolved.slice(index + marker.length).split('/')[0] ?? null;
        }
        if (!target || target === from) continue;
        if (
          spec === `@/modules/${target}` ||
          spec === `@/modules/${target}/index`
        )
          continue;
        violations.push(
          `${path.relative(modulesRoot, file).replaceAll('\\', '/')} -> ${spec}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
