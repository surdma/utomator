import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const roots = [
  'apps/backend/src',
  'apps/backend/tests',
  'apps/backend/growth',
  'apps/backend/crafts',
  'apps/backend/hosted',
  'apps/frontend/app',
  'apps/frontend/components',
  'apps/frontend/hooks',
  'apps/frontend/lib',
  'apps/frontend/modules',
  'apps/frontend/tests',
];

const backendMoves = new Map([
  ['apps/backend/src/core/errors.ts', 'apps/backend/src/domain/errors.ts'],
  ['apps/backend/src/core/types.ts', 'apps/backend/src/domain/types.ts'],
  ['apps/backend/src/core/validate.ts', 'apps/backend/src/domain/validate.ts'],
  ['apps/backend/src/core/events.ts', 'apps/backend/src/domain/events.ts'],
  ['apps/backend/src/workflows/workflow-plan.ts', 'apps/backend/src/domain/workflow-plan.ts'],
  ['apps/backend/src/core/paths.ts', 'apps/backend/src/infrastructure/runtime/paths.ts'],
  ['apps/backend/src/db/schema-sqlite.ts', 'apps/backend/src/infrastructure/db/schema-sqlite.ts'],
  ['apps/backend/src/db/schema-postgres.ts', 'apps/backend/src/infrastructure/db/schema-postgres.ts'],
  ['apps/backend/src/db/documents.ts', 'apps/backend/src/infrastructure/db/documents.ts'],
  ['apps/backend/src/db/persistence.ts', 'apps/backend/src/infrastructure/db/persistence.ts'],
  ['apps/backend/src/db/backed-store.ts', 'apps/backend/src/infrastructure/db/backed-store.ts'],
  ['apps/backend/src/browser/provider.ts', 'apps/backend/src/infrastructure/browser/provider.ts'],
  ['apps/backend/src/browser/session.ts', 'apps/backend/src/infrastructure/browser/session.ts'],
  ['apps/backend/src/browser/streaming-signin.ts', 'apps/backend/src/infrastructure/browser/streaming-signin.ts'],
  ['apps/backend/src/browser/login.ts', 'apps/backend/src/infrastructure/browser/login.ts'],
  ['apps/backend/src/browser/navigation.ts', 'apps/backend/src/infrastructure/browser/navigation.ts'],
  ['apps/backend/src/browser/vault-probe.ts', 'apps/backend/src/infrastructure/browser/vault-probe.ts'],
  ['apps/backend/src/connect/session-vault.ts', 'apps/backend/src/infrastructure/connect/session-vault.ts'],
  ['apps/backend/src/connect/store.ts', 'apps/backend/src/infrastructure/connect/store.ts'],
  ['apps/backend/src/mator/mator-groq.ts', 'apps/backend/src/infrastructure/mator/mator-groq.ts'],
  ['apps/backend/src/mator/mator-crypto.ts', 'apps/backend/src/infrastructure/mator/mator-crypto.ts'],
  ['apps/backend/src/runs/runner.ts', 'apps/backend/src/application/runs/runner.ts'],
  ['apps/backend/src/engine/growth-profile.ts', 'apps/backend/src/application/growth/growth-profile.ts'],
  ['apps/backend/src/engine/profile-growth-coordinator.ts', 'apps/backend/src/application/growth/profile-growth-coordinator.ts'],
  ['apps/backend/src/engine/growth-template-store.ts', 'apps/backend/src/infrastructure/growth/growth-template-store.ts'],
  ['apps/backend/src/mator/mator-agent.ts', 'apps/backend/src/application/mator/mator-agent.ts'],
  ['apps/backend/src/mator/mator-actions.ts', 'apps/backend/src/application/mator/mator-actions.ts'],
  ['apps/backend/src/mator/mator-action-parser.ts', 'apps/backend/src/domain/mator/mator-action-parser.ts'],
  ['apps/backend/src/mator/mator-routes.ts', 'apps/backend/src/interface/http/mator-routes.ts'],
  ['apps/backend/src/crafts/library.ts', 'apps/backend/src/application/crafts/library.ts'],
  ['apps/backend/src/connect/service.ts', 'apps/backend/src/application/connect/service.ts'],
  ['apps/backend/src/connect/connector-session.ts', 'apps/backend/src/application/connect/connector-session.ts'],
  ['apps/backend/src/connect/connector-verifier.ts', 'apps/backend/src/application/connect/connector-verifier.ts'],
  ['apps/backend/src/connect/connector-status.ts', 'apps/backend/src/domain/connect/connector-status.ts'],
  ['apps/backend/src/connect/connector-consts.ts', 'apps/backend/src/domain/connect/connector-consts.ts'],
  ['apps/backend/src/workflows/execute.ts', 'apps/backend/src/infrastructure/workflows/execute.ts'],
  ['apps/backend/src/workflows/workflow-store.ts', 'apps/backend/src/infrastructure/workflows/workflow-store.ts'],
  ['apps/backend/src/workflows/step-definitions.ts', 'apps/backend/src/infrastructure/workflows/step-definitions.ts'],
  ['apps/backend/src/workflows/step-forms.ts', 'apps/backend/src/infrastructure/workflows/step-forms.ts'],
  ['apps/backend/src/workflows/workflow-registry.ts', 'apps/backend/src/infrastructure/workflows/workflow-registry.ts'],
  ['apps/backend/src/workflows/workflow-yaml.ts', 'apps/backend/src/infrastructure/workflows/workflow-yaml.ts'],
]);

function newHome(rel) {
  if (rel.startsWith('apps/backend/src/domain/')) return 'stay (domain)';
  if (rel.startsWith('apps/backend/src/application/')) return 'stay (application)';
  if (rel.startsWith('apps/backend/src/infrastructure/')) return 'stay (infrastructure)';
  if (rel.startsWith('apps/backend/src/interface/')) return 'stay (interface)';
  if (rel.startsWith('apps/frontend/modules/')) return 'stay (module)';
  if (backendMoves.has(rel)) return backendMoves.get(rel);
  if (rel === 'apps/backend/src/main.ts' || rel === 'apps/backend/src/server.ts') return 'stay (composition root)';
  if (rel.startsWith('apps/backend/src/domain/')) return 'stay (domain)';
  if (rel.startsWith('apps/backend/src/workflows/')) return 'stay (workflow contract)';
  if (rel.startsWith('apps/backend/src/api/')) return rel.replace('apps/backend/src/api/', 'apps/backend/src/interface/http/');
  if (rel.startsWith('apps/backend/src/workflows/steps/')) {
    return rel.replace('apps/backend/src/workflows/steps/', 'apps/backend/src/infrastructure/workflow-steps/');
  }
  if (rel.startsWith('apps/backend/src/runs/')) return rel.replace('apps/backend/src/runs/', 'apps/backend/src/application/runs/');
  if (rel.startsWith('apps/backend/src/linkedin/')) return rel.replace('apps/backend/src/linkedin/', 'apps/backend/src/application/linkedin/');
  if (rel.startsWith('apps/backend/src/profile/')) {
    if (rel.endsWith('-store.ts')) return rel.replace('apps/backend/src/profile/', 'apps/backend/src/infrastructure/profile/');
    return rel.replace('apps/backend/src/profile/', 'apps/backend/src/application/profile/');
  }
  if (rel.startsWith('apps/backend/src/mator/')) return rel.replace('apps/backend/src/mator/', 'apps/backend/src/application/mator/');
  if (rel.startsWith('apps/backend/growth/') || rel.startsWith('apps/backend/crafts/') || rel.startsWith('apps/backend/hosted/')) {
    return 'stay';
  }
  if (rel.startsWith('apps/backend/tests/') || rel.startsWith('apps/frontend/tests/')) return 'stay until the module they cover moves';
  if (rel.startsWith('apps/frontend/app/')) return 'stay (route)';
  if (rel.startsWith('apps/frontend/components/ui/')) return 'stay (shared primitive)';
  if (
    rel.startsWith('apps/frontend/components/home/') ||
    rel.startsWith('apps/frontend/components/svgs/') ||
    rel === 'apps/frontend/components/footer.tsx' ||
    rel === 'apps/frontend/components/navbar.tsx' ||
    rel === 'apps/frontend/components/logo.tsx' ||
    rel === 'apps/frontend/components/page-transistion.tsx' ||
    rel === 'apps/frontend/components/page_layout.tsx' ||
    rel === 'apps/frontend/components/index.ts'
  ) {
    return 'stay (marketing shell)';
  }
  if (rel === 'apps/frontend/lib/utils.ts') return 'stay';
  if (rel.startsWith('apps/frontend/hooks/use-growth-') || rel.startsWith('apps/frontend/lib/growth-')) {
    return 'apps/frontend/modules/growth/';
  }
  const feature = rel.match(/^apps\/frontend\/components\/dashboard\/([^/]+)\//);
  if (feature) {
    const name = feature[1] === 'account' ? 'settings' : feature[1];
    if (name === 'gallery') return 'stay (empty directory, no source file)';
    if (rel.includes('/career/intelligence/')) return 'apps/frontend/modules/intelligence/';
    return `apps/frontend/modules/${name}/`;
  }
  if (rel === 'apps/frontend/components/dashboard/dashboard-shell.tsx') return 'apps/frontend/modules/shell/';
  if (rel.startsWith('apps/frontend/components/mator/')) return 'apps/frontend/modules/mator/';
  return 'pending';
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|type|interface|enum)\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\s+/.test(source)) names.add('default');
  return [...names].sort();
}

function routesOf(source) {
  return [...source.matchAll(/\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)].map(
    (match) => `${match[1].toUpperCase()} ${match[2]}`,
  );
}

const files = [];
for (const rel of roots) {
  try {
    files.push(...(await walk(path.join(root, rel))));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
const texts = new Map();
for (const file of files) {
  texts.set(file, await readFile(file, 'utf8'));
}

const lines = [
  '# Modular monolith inventory',
  '',
  'Generated by `scripts/modular-monolith-inventory.mjs`. A row is not a deletion approval.',
  '',
  '| File | Exports | Routes | Importers | New home | Unit | Feature | UI |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];

for (const file of files.sort()) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const source = texts.get(file) ?? '';
  const importers = [];
  const base = path.basename(file).replace(/\.(ts|tsx|mjs|js|yaml|mdx)$/, '');
  for (const [other, text] of texts) {
    if (other === file) continue;
    if (text.includes(base)) importers.push(path.relative(root, other).replaceAll('\\', '/'));
  }
  const cell = (value) => (Array.isArray(value) ? value.join(', ') : value).replaceAll('|', '\\|') || '—';
  const testName = (kind) => {
    const hits = importers.filter((item) => {
      if (kind === 'unit') {
        return (
          (item.includes('/tests/unit/') || /\/tests\/[^/]+\.(test|spec)\./.test(item)) &&
          !item.includes('/tests/feature/') &&
          !item.includes('frontend-quality') &&
          !item.endsWith('.integration.test.ts')
        );
      }
      if (kind === 'feature') return item.includes('/tests/feature/');
      return item.includes('frontend-quality') || item.includes('/tests/browser');
    });
    if (hits.length === 0) return '—';
    return hits
      .slice(0, 2)
      .map((item) => item.split('/').pop())
      .join(', ');
  };
  lines.push(
    `| \`${rel}\` | ${cell(exportsOf(source))} | ${cell(routesOf(source))} | ${cell(importers.slice(0, 8))} | ${cell(newHome(rel))} | ${cell(testName('unit'))} | ${cell(testName('feature'))} | ${cell(testName('ui'))} |`,
  );
}

await writeFile(
  path.join(root, 'docs/superpowers/plans/2026-11-07-modular-monolith-inventory.md'),
  `${lines.join('\n')}\n`,
);
const unmapped = lines.filter((line) => line.includes('| pending | pending | pending | pending |')).length;
console.log(`wrote ${files.length} rows`);
console.log(`unmapped ${unmapped}`);
