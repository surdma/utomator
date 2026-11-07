import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/backend');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.runtime') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|mjs|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const withoutExtension = spec.replace(/\.(js|mjs|ts|tsx)$/, '');
  const base = path.resolve(path.dirname(fromFile), withoutExtension);
  return [`${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts'), base];
}

function parseShim(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  if (!stripped) return null;
  const parts = [...stripped.matchAll(/export\s+(?:type\s+)?(?:\*|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]\s*;?/g)];
  if (!parts.length) return null;
  const remainder = stripped.replace(/export\s+(?:type\s+)?(?:\*|\{[^}]+\})\s+from\s+['"][^'"]+['"]\s*;?/g, '').replace(/\s+/g, '');
  if (remainder !== '') return null;
  const targets = new Set(parts.map((part) => part[1]));
  if (targets.size !== 1) return null;
  return [...targets][0];
}

const files = await walk(root);
const texts = new Map();
for (const file of files) texts.set(file, await readFile(file, 'utf8'));

const shimTarget = new Map();
for (const [file, source] of texts) {
  const spec = parseShim(source);
  if (!spec) continue;
  const candidates = resolveImport(file, spec) ?? [];
  const hit = candidates.find((candidate) => texts.has(candidate));
  if (hit) shimTarget.set(file, hit);
}

function realFile(file, seen = new Set()) {
  if (seen.has(file)) return file;
  seen.add(file);
  const next = shimTarget.get(file);
  return next ? realFile(next, seen) : file;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

let rewritten = 0;
for (const [file, source] of texts) {
  if (shimTarget.has(file)) continue;
  const next = source.replace(/(from\s+|import\s*\(\s*|import\s+)(['"])(\.[^'"]+)\2/g, (match, lead, quote, spec) => {
    const candidates = resolveImport(file, spec) ?? [];
    const hit = candidates.find((candidate) => shimTarget.has(candidate));
    if (!hit) return match;
    const destination = realFile(hit);
    let relative = toPosix(path.relative(path.dirname(file), destination));
    if (!relative.startsWith('.')) relative = `./${relative}`;
    if (spec.endsWith('.js')) relative = relative.replace(/\.ts$/, '.js');
    else if (!path.extname(spec)) relative = relative.replace(/\.(tsx?|mjs)$/, '');
    return `${lead}${quote}${relative}${quote}`;
  });
  if (next !== source) {
    await writeFile(file, next);
    rewritten += 1;
  }
}

for (const file of shimTarget.keys()) await rm(file);
console.log(`retargeted ${rewritten} files, removed ${shimTarget.size} shims`);
