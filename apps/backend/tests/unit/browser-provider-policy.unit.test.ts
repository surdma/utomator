import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openScratch, scratchDirectory } from '../../src/infrastructure/browser/provider.js';

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('browser launch policy', () => {
  it('gives every scratch profile its own directory', () => {
    expect(scratchDirectory('connect')).not.toBe(scratchDirectory('run'));
    expect(typeof openScratch).toBe('function');
  });

  it('launches persistent contexts only from the infrastructure provider', async () => {
    const files = await sourceFiles(path.resolve('src'));
    const launchers = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (source.includes('chromium.launchPersistentContext') || source.includes('chromium.launch(')) {
        launchers.push(path.relative(path.resolve('src'), file).replaceAll('\\', '/'));
      }
    }
    expect(launchers).toEqual(['infrastructure/browser/provider.ts']);
  });
});
