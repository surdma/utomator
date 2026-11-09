import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const forbidden = [
  /from ['"]fastify['"]/,
  /from ['"]drizzle-orm/,
  /from ['"]playwright['"]/,
  /from ['"]groq-sdk['"]/,
  /from ['"]node:fs/,
];

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

async function expectNoFrameworks(dir: string) {
  const files = await sourceFiles(dir);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      expect(source, file).not.toMatch(pattern);
    }
  }
}

describe('backend layer boundary', () => {
  it('domain does not import frameworks', async () => {
    await expectNoFrameworks(path.resolve('src/domain'));
  });

  it('application does not import frameworks', async () => {
    await expectNoFrameworks(path.resolve('src/application'));
  });
});
