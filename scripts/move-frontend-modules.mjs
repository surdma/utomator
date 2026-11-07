import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/frontend');
const features = [
  'career',
  'connections',
  'crafts',
  'editorial',
  'growth',
  'pipeline',
  'research',
  'reviews',
  'workflows',
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function mapRel(rel) {
  const posix = toPosix(rel);
  if (posix.startsWith('components/dashboard/career/intelligence/')) {
    return `modules/intelligence/components/${posix.slice('components/dashboard/career/intelligence/'.length)}`;
  }
  if (posix === 'components/dashboard/dashboard-shell.tsx') {
    return 'modules/shell/components/dashboard-shell.tsx';
  }
  if (posix.startsWith('components/dashboard/account/')) {
    return `modules/settings/components/account/${posix.slice('components/dashboard/account/'.length)}`;
  }
  if (posix.startsWith('components/dashboard/settings/')) {
    return `modules/settings/components/${posix.slice('components/dashboard/settings/'.length)}`;
  }
  for (const feature of features) {
    const prefix = `components/dashboard/${feature}/`;
    if (posix.startsWith(prefix)) return `modules/${feature}/components/${posix.slice(prefix.length)}`;
  }
  if (posix.startsWith('components/mator/')) {
    return `modules/mator/components/${posix.slice('components/mator/'.length)}`;
  }
  if (posix.startsWith('hooks/use-growth-')) {
    return `modules/growth/hooks/${path.posix.basename(posix)}`;
  }
  if (posix.startsWith('lib/growth-')) {
    return `modules/growth/model/${path.posix.basename(posix)}`;
  }
  return null;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(tsx?|mjs|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function resolveExisting(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.css`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates;
}

function rebaseSpecifier(spec, oldFile, newFile, known) {
  if (!spec.startsWith('.')) return spec;
  const base = path.resolve(path.dirname(oldFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.css`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  const hit = candidates.find((candidate) => known.has(candidate));
  if (!hit) return spec;
  const destination = known.get(hit) ?? hit;
  let next = toPosix(path.relative(path.dirname(newFile), destination));
  if (!next.startsWith('.')) next = `./${next}`;
  if (!path.extname(spec)) next = next.replace(/\.(tsx?|mjs|css|js)$/, '');
  return next;
}

function rewriteText(text) {
  return text
    .replaceAll('@/components/dashboard/dashboard-shell', '@/modules/shell')
    .replaceAll('components/dashboard/career/intelligence/', 'modules/intelligence/components/')
    .replaceAll('components/dashboard/account/', 'modules/settings/components/account/')
    .replaceAll('components/dashboard/dashboard-shell', 'modules/shell/components/dashboard-shell')
    .replaceAll('components/dashboard/settings/', 'modules/settings/components/')
    .replace(
      /components\/dashboard\/(career|connections|crafts|editorial|growth|pipeline|research|reviews|workflows)\//g,
      'modules/$1/components/',
    )
    .replaceAll('components/mator/', 'modules/mator/components/')
    .replace(/hooks\/(use-growth-[\w.-]+)/g, 'modules/growth/hooks/$1')
    .replace(/lib\/(growth-[\w.-]+)/g, 'modules/growth/model/$1');
}

const files = await walk(root);
const known = new Map(files.map((file) => [file, null]));
for (const file of files) {
  const rel = toPosix(path.relative(root, file));
  const mapped = mapRel(rel);
  known.set(file, mapped ? path.join(root, mapped) : file);
}

const specPattern = /(from\s+|import\s*\(\s*)(['"])(\.[^'"]+)\2/g;
let moved = 0;
for (const file of files) {
  const destination = known.get(file);
  let source = await readFile(file, 'utf8');
  source = source.replace(specPattern, (match, lead, quote, spec) => {
    const next = rebaseSpecifier(spec, file, destination, known);
    return `${lead}${quote}${next}${quote}`;
  });
  source = rewriteText(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
  if (destination !== file) {
    await rm(file);
    moved += 1;
  }
}

async function removeEmpty(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmpty(path.join(dir, entry.name));
  }
  const left = await readdir(dir);
  if (left.length === 0 && dir !== root) await rm(dir, { recursive: true });
}

await removeEmpty(path.join(root, 'components/dashboard'));
await removeEmpty(path.join(root, 'hooks'));
console.log(`moved ${moved} files`);
