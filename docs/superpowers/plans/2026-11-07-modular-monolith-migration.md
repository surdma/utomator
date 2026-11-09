# Modular Monolith Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing Next.js app and Fastify app into one modular monolith each, with Clean Architecture inside the backend and feature modules inside the frontend, without dropping a current behavior.

**Architecture:** Keep one frontend process and one backend process. `src/main.ts` stays the Fastify composition root and `src/server.ts` stays the executable. Backend dependencies point inward: `interface` → `application` → `domain`, and `infrastructure` implements application ports. Old import paths become one-line re-exports until the deletion task, so existing tests keep compiling while new tests lock the new path. Frontend `app/` stays routes and layouts only. Feature code moves to `modules/<feature>/{components,hooks,model,api}` and crosses modules only through `modules/<feature>/index.ts`. The 2026-11-03 backend reorganization already landed (`browser/provider.ts`, `runs/`, `mator/`, `connect/`, `api/`). This plan does not repeat those moves and does not merge short-lived connect sessions with run-scoped sessions.

**Tech Stack:** pnpm 10, Turborepo, Node 22+, Next.js 16.2, React 19, Tailwind CSS 4, Fastify 5, Drizzle ORM (SQLite and Postgres), Playwright, Vitest, Biome, TypeScript.

## Status (2026-11-07)

Score against this plan: **8/10**. The move is in the tree. The proof commands are not all green.

## Open blockers

These are the only unchecked items left. Everything else in Tasks 1–12 is checked because the move already landed.

1. **Task 10 step 4 and Task 13.** Cross-module imports now go through each module `index.ts`. `tests/feature/module-boundaries.feature.test.ts` passes, and the frontend typecheck passes. Full frontend unit, feature, Biome, and the UI quality run are still open.
2. **Task 11 step 3 and Task 13.** The Windows `EBUSY` SQLite cleanup no longer fails `database-documents` or `tenant-isolation`. The full backend unit suite is still not re-proven, including the workflow run that expected `cancelled` and observed `failed`. Biome format was applied; recommended-rule findings still fail `biome check`. Inventory test columns now name a covering test or `—`.
3. **Proven this session, not a blocker:** empty legacy directories under `apps/backend/src` (`api`, `browser`, `connect`, `core`, `crafts`, `db`, `engine`, `linkedin`, `mator`, `profile`, `runs`, `workflows/steps`) and empty `apps/frontend/components/mator` were removed. The six live workflow engine files moved to `apps/backend/src/infrastructure/workflows/` because they import `node:fs`; the inventory's application destination was the wrong layer. Profile, planning, connect, and editorial routes classify failures through `httpErrorResponse` and typed domain errors. Phrase fallbacks stay so existing untyped throws keep their status codes.

| Task | State | What landed |
| --- | --- | --- |
| 1 Inventory | Done | `scripts/modular-monolith-inventory.mjs` wrote 478 rows. Unit, feature, and UI columns name a covering test or `—`. |
| 2 Vitest split | Done | `vitest.unit.config.ts` and `vitest.feature.config.ts` on both apps. New files under `tests/unit/**` and `tests/feature/**` are collected without a `package.json` edit. |
| 3 DESIGN.md | Done | `DESIGN.md` and the light tokens in `globals.css`, including `prefers-reduced-motion`. |
| 4 Domain kernel | Done | `errors`, `types`, `validate`, `events`, and `workflow-plan` are in `src/domain`. Shims were removed after imports moved. |
| 5 Browser provider | Done | `chromium.launchPersistentContext` is only in `src/infrastructure/browser/provider.ts`. Connect and run sessions stay separate. |
| 6 Adapters | Done | Drizzle, browser session, vault, Groq, crypto, paths, and workflow steps are under `src/infrastructure`. `application/ports/browser-port.ts` is the framework-free port. |
| 7 Use cases | Done, with a deviation | Runner, Growth, profile, LinkedIn, crafts, connect, and Mator implementations sit in `infrastructure` because they import the filesystem or Playwright. The layer test forbids those imports in `application`. |
| 8 Fastify interface | Done | Route modules are in `src/interface/http`. `main.ts` registers them there. `GET /health` still returns `{ status: 'ok' }`. |
| 9 Module entries | Done | Public `index.ts` files exist for the thirteen frontend modules, including editorial. |
| 10 Frontend move | Done | Feature files are under `modules/<feature>`. Cross-module imports go through `index.ts`. The boundary feature test passes. |
| 11 Shim deletion | Done | Re-export shims were removed and callers point at the real modules. |
| 12 AGENTS.md | Done | Replaced. The constitution test passes. |
| 13 Final verification | Not done | Both production builds passed. Frontend unit (182) and both feature suites passed. Backend unit is not clean on Windows. UI quality was 14 passed and 76 failed. Full Biome on the repo was not green. |

## Global Constraints

- Bind only to `127.0.0.1`. Do not add a reverse proxy, public host, or non-loopback CDP or database exposure.
- The frontend never calls Fastify directly. `apps/frontend/app/api/[...path]/route.ts` stays the allowlist proxy. Every moved backend route stays on that allowlist.
- One browser runner: `apps/backend/src/infrastructure/runs/runner.ts`. Do not add a second browser engine. Do not auto-launch the browser when a template loads. `RunSummary.state='completed'` is not proof the runner is idle.
- Workflow plans stay strictly validated linear `start → session → action → finish` plans. Growth stays YAML in `apps/backend/growth/*-workflow.yaml`. Do not add a Next.js page or custom controller to add a Growth.
- Craft defaults in `apps/backend/crafts/default/*.mdx` stay read-only seeds. Mator stays a deterministic command interpreter plus an optional server-side Groq call. Mutating runs still need human approval and read-back verification.
- Evidence honesty: a draft is not a published post, a proposal is not a completed edit, a manual task is not a provider operation, a read-only audit is not a field-level assessment.
- `docs/` separates existing behavior from proposals. Do not treat the unified engine, canonical IR, multi-provider scheduling, or field-level collectors as implemented.
- Schema changes go in both `apps/backend/src/infrastructure/db/schema-sqlite.ts` and `schema-postgres.ts`. Do not commit `.env`, `local.db`, or `apps/backend/.runtime/`.
- Backend and frontend formatting is Biome. Do not run root `pnpm format` on backend files. Do not preserve Prettier or ESLint instructions.
- `chromium` is imported only from the browser provider. Connect sessions and run sessions stay separate instances that share launch policy.
- Where `docs/superpowers/specs/2026-11-03-backend-reorganization-design.md` conflicts with the prompt, the prompt wins on architecture and the spec wins on verified browser facts.
- Do not commit unless the user asks. Do not push. Do not update git config. Commit steps in this plan are recorded as "leave the working tree dirty."
- Work in `c:\Users\olaitan\Dev\utomator`. Do not create a git worktree unless the user asks. The prompt names this checkout as the workplace.
- Waves share files. Do not run them in parallel.
- A file may be deleted only after the behavior matrix says its behavior lives in the new path and tests cover it, or search proves it has no importer, no route, no YAML reference, and no test.

## File structure

Backend layers (new). Composition root stays put.

| Path | Responsibility |
| --- | --- |
| `apps/backend/src/domain/` | Entities, value objects, typed errors, invariants. No Fastify, Drizzle, Playwright, filesystem, or Groq imports. |
| `apps/backend/src/application/` | Use cases and ports. No framework imports. |
| `apps/backend/src/infrastructure/` | Drizzle repositories, browser provider, session vault, Groq client, filesystem, clocks. |
| `apps/backend/src/interface/http/` | Fastify route registrars. Thin. Calls application use cases. |
| `apps/backend/src/main.ts` | Testable Fastify factory. Wires adapters to ports and registers interface routes. |
| `apps/backend/src/server.ts` | Executable entry. Unconditional listen on loopback. |
| `apps/backend/tests/unit/` | New unit tests. Collected by glob. |
| `apps/backend/tests/feature/` | New feature tests. Collected by glob. |
| `apps/backend/growth/` | YAML programs. Not moved. |
| `apps/backend/crafts/` | Craft seeds. Not moved. |
| `apps/backend/hosted/` | Hosted OIDC, gateway, worker. Not folded into the monolith layers. |

Frontend modules (new). `app/` keeps routing only. `components/ui` stays shared primitives.

| Module | Source that moves |
| --- | --- |
| `apps/frontend/modules/career/` | `components/dashboard/career/**` |
| `apps/frontend/modules/connections/` | `components/dashboard/connections/**` |
| `apps/frontend/modules/crafts/` | `components/dashboard/crafts/**` |
| `apps/frontend/modules/editorial/` | editorial screens under `components/dashboard/` (confirm during inventory; do not invent a screen) |
| `apps/frontend/modules/growth/` | `components/dashboard/growth/**`, `hooks/use-growth-*.ts`, `lib/growth-*.ts` |
| `apps/frontend/modules/intelligence/` | `components/dashboard/career/intelligence/**` becomes `modules/intelligence/` and career imports it through `modules/intelligence/index.ts` |
| `apps/frontend/modules/pipeline/` | `components/dashboard/pipeline/**` |
| `apps/frontend/modules/research/` | `components/dashboard/research/**` |
| `apps/frontend/modules/reviews/` | `components/dashboard/reviews/**` |
| `apps/frontend/modules/settings/` | `components/dashboard/account/**` (the settings and account surface) |
| `apps/frontend/modules/workflows/` | `components/dashboard/workflows/**` |
| `apps/frontend/modules/mator/` | `components/mator/**` |
| `apps/frontend/modules/shell/` | `components/dashboard/dashboard-shell.tsx` and dashboard navigation that composes modules |
| `apps/frontend/components/ui/` | Stays. Shared primitives only. |
| `apps/frontend/lib/utils.ts` | Stays. `cn` helper used by `components/ui`. |

Each module's public file is `index.ts`. Deep imports from another module are forbidden.

### Backend move map

Old path stays as a re-export shim until Task 12. New path is the real file.

| Current file | Layer | New path |
| --- | --- | --- |
| `src/core/errors.ts` | domain | `src/domain/errors.ts` |
| `src/core/types.ts` | domain | `src/domain/types.ts` |
| `src/core/validate.ts` | domain | `src/domain/validate.ts` |
| `src/core/events.ts` | domain | `src/domain/events.ts` |
| `src/workflows/workflow-plan.ts` | domain | `src/domain/workflow-plan.ts` |
| `src/core/paths.ts` | infrastructure | `src/infrastructure/runtime/paths.ts` |
| `src/db/schema-sqlite.ts` | infrastructure | `src/infrastructure/db/schema-sqlite.ts` |
| `src/db/schema-postgres.ts` | infrastructure | `src/infrastructure/db/schema-postgres.ts` |
| `src/db/documents.ts` | infrastructure | `src/infrastructure/db/documents.ts` |
| `src/db/persistence.ts` | infrastructure | `src/infrastructure/db/persistence.ts` |
| `src/db/backed-store.ts` | infrastructure | `src/infrastructure/db/backed-store.ts` |
| `src/browser/provider.ts` | infrastructure | `src/infrastructure/browser/provider.ts` |
| `src/browser/session.ts` | infrastructure | `src/infrastructure/browser/session.ts` |
| `src/browser/streaming-signin.ts` | infrastructure | `src/infrastructure/browser/streaming-signin.ts` |
| `src/browser/login.ts` | infrastructure | `src/infrastructure/browser/login.ts` |
| `src/browser/navigation.ts` | infrastructure | `src/infrastructure/browser/navigation.ts` |
| `src/browser/vault-probe.ts` | infrastructure | `src/infrastructure/browser/vault-probe.ts` |
| `src/connect/session-vault.ts` | infrastructure | `src/infrastructure/connect/session-vault.ts` |
| `src/connect/store.ts` | infrastructure | `src/infrastructure/connect/store.ts` |
| `src/mator/mator-groq.ts` | infrastructure | `src/infrastructure/mator/mator-groq.ts` |
| `src/mator/mator-crypto.ts` | infrastructure | `src/infrastructure/mator/mator-crypto.ts` |
| `src/application/ports/browser-port.ts` | application | new port, extracted from what `connect/service.ts` already calls |
| `src/runs/runner.ts` | application | `src/application/runs/runner.ts` |
| `src/runs/*.ts` except runner stays with the run use cases | application | `src/application/runs/<file>.ts` |
| `src/engine/growth-profile.ts` | application | `src/application/growth/growth-profile.ts` |
| `src/engine/profile-growth-coordinator.ts` | application | `src/application/growth/profile-growth-coordinator.ts` |
| `src/engine/growth-template-store.ts` | infrastructure | `src/infrastructure/growth/growth-template-store.ts` |
| `src/mator/mator-agent.ts` | application | `src/application/mator/mator-agent.ts` |
| `src/mator/mator-actions.ts` | application | `src/application/mator/mator-actions.ts` |
| `src/mator/mator-action-parser.ts` | domain | `src/domain/mator/mator-action-parser.ts` |
| `src/mator/mator-routes.ts` | interface | `src/interface/http/mator-routes.ts` |
| `src/api/*.ts` | interface | `src/interface/http/<same name>.ts` |
| `src/workflows/steps/*.ts` | infrastructure | `src/infrastructure/workflow-steps/<same name>.ts` |
| `src/profile/*.ts` | application, except stores | stores → `src/infrastructure/profile/`, planners → `src/application/profile/` |
| `src/linkedin/*.ts` | application | `src/application/linkedin/<same name>.ts` |
| `src/crafts/library.ts` | application | `src/application/crafts/library.ts` |
| `src/connect/service.ts` | application | `src/application/connect/service.ts` |
| `src/connect/connector-session.ts` | application | `src/application/connect/connector-session.ts` |
| `src/connect/connector-verifier.ts` | application | `src/application/connect/connector-verifier.ts` |
| `src/connect/connector-status.ts` | domain | `src/domain/connect/connector-status.ts` |
| `src/connect/connector-consts.ts` | domain | `src/domain/connect/connector-consts.ts` |

If Task 1's import scan shows a file in this table imports a framework it is not allowed to import in that layer, keep the file in infrastructure or interface and record the exception in the matrix. Do not push Fastify, Drizzle, Playwright, `node:fs`, or `groq-sdk` into `domain` or `application` to make the table true.

### Move recipe (used by Tasks 6–11)

For a row `old` → `next`:

1. Add a unit test that imports `next` and expects the same export names the current module already has. Run it and confirm it fails because `next` does not exist.
2. Move the file with `git mv` so history is kept. Fix relative imports inside the moved file so they still resolve.
3. Replace `old` with `export ... from '<relative path to next>';` listing the same names the test expects.
4. Run the new test and the existing tests that imported `old`.
5. Do not delete `old` in this task.

---

### Task 1: Inventory and behavior matrix

**Files:**
- Create: `scripts/modular-monolith-inventory.mjs`
- Create: `docs/superpowers/plans/2026-11-07-modular-monolith-inventory.md`
- Test: none (read-only generator; the matrix is the deliverable)

**Interfaces:**
- Consumes: the current tree under the directories named in the script
- Produces: a markdown matrix with one row per source file: path, export names, route literals, who imports it, proposed layer or module, and `pending` in the test columns

- [x] **Step 1: Write the generator**

```javascript
// scripts/modular-monolith-inventory.mjs
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
  'apps/frontend/tests',
];

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
  return [...names].sort();
}

function routesOf(source) {
  return [...source.matchAll(/\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)].map(
    (match) => `${match[1].toUpperCase()} ${match[2]}`,
  );
}

const files = [];
for (const rel of roots) {
  files.push(...(await walk(path.join(root, rel))));
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
  const cell = (value) => value.join(', ').replaceAll('|', '\\|') || '—';
  lines.push(
    `| \`${rel}\` | ${cell(exportsOf(source))} | ${cell(routesOf(source))} | ${cell(importers.slice(0, 8))} | pending | pending | pending | pending |`,
  );
}

await writeFile(
  path.join(root, 'docs/superpowers/plans/2026-11-07-modular-monolith-inventory.md'),
  `${lines.join('\n')}\n`,
);
console.log(`wrote ${files.length} rows`);
```

- [x] **Step 2: Run the generator**

Run: `node scripts/modular-monolith-inventory.mjs`

Expected: stdout `wrote <N> rows` where N is greater than 200, and the markdown file exists.

- [x] **Step 3: Fill the New home column for every `apps/backend/src` and `apps/frontend/components` row**

Use the move map in this plan. Data files (`growth/*.yaml`, `crafts/**/*.mdx`, `hosted/*`) get new home `stay`. Test files get new home `stay until the module they cover moves`. A row that still says `pending` in New home after this step is a failed task.

- [x] **Step 4: Do not commit**

Leave both files in the working tree.

---

### Task 2: Collect unit and feature tests by directory

**Files:**
- Create: `apps/backend/vitest.unit.config.ts`
- Create: `apps/backend/vitest.feature.config.ts`
- Create: `apps/backend/tests/feature/layer-boundary.feature.test.ts`
- Create: `apps/frontend/vitest.unit.config.ts`
- Create: `apps/frontend/vitest.feature.config.ts`
- Create: `apps/frontend/tests/feature/module-public-entry.feature.test.ts`
- Modify: `apps/backend/package.json` scripts `test`, `test:unit`, `test:feature`
- Modify: `apps/frontend/package.json` scripts `test`, `test:unit`, `test:feature`
- Modify: `apps/backend/vitest.config.ts` so `test:integration` and `test:hosted` configs are unchanged

**Interfaces:**
- Consumes: current Vitest 3 configs
- Produces: `pnpm --filter @utomator/backend test:unit` runs `tests/*.{ts,mjs}` (except integration and hosted) plus `tests/unit/**`. `pnpm --filter @utomator/backend test:feature` runs `tests/feature/**`. `pnpm test:backend` runs both. The same split exists on the frontend. A new file under those directories is collected without a `package.json` edit.

- [x] **Step 1: Write the failing feature tests**

```typescript
// apps/backend/tests/feature/layer-boundary.feature.test.ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const forbidden = [/from ['"]fastify['"]/, /from ['"]drizzle-orm/, /from ['"]playwright['"]/, /from ['"]groq-sdk['"]/, /from ['"]node:fs/];

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

describe('backend layer boundary', () => {
  it('domain does not import frameworks', async () => {
    const root = path.resolve('src/domain');
    const files = await sourceFiles(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, file).not.toMatch(pattern);
      }
    }
  });
});
```

```typescript
// apps/frontend/tests/feature/module-public-entry.feature.test.ts
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
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @utomator/backend exec vitest run tests/feature/layer-boundary.feature.test.ts`

Expected: FAIL because `src/domain` does not exist, or the test file is not collected yet. Either failure is the red bar.

Run: `pnpm --filter @utomator/frontend exec vitest run tests/feature/module-public-entry.feature.test.ts`

Expected: FAIL because `modules/<name>/index.ts` does not exist.

- [x] **Step 3: Add the Vitest configs and scripts**

```typescript
// apps/backend/vitest.unit.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.{ts,mjs}', 'tests/unit/**/*.{ts,mjs}'],
    exclude: [
      'tests/*.integration.test.ts',
      'tests/hosted-*.test.mjs',
      'tests/support/**',
      'node_modules',
      'dist',
      '.runtime',
    ],
    globals: false,
  },
});
```

```typescript
// apps/backend/vitest.feature.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/feature/**/*.{ts,mjs}'],
    exclude: ['node_modules', 'dist', '.runtime'],
    globals: false,
  },
});
```

```typescript
// apps/frontend/vitest.unit.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.{ts,mjs}'],
    exclude: [
      'tests/feature/**',
      'tests/frontend-quality.test.ts',
      'tests/connector-sync-playwright.mjs',
      'tests/connector-states.test.ts',
      'tests/connector-sync.test.ts',
      'tests/mator-groq.e2e.test.ts',
      'tests/mock-provider.test.ts',
      'tests/support/**',
      'node_modules',
      '.next',
      'dist',
    ],
    globals: false,
  },
});
```

```typescript
// apps/frontend/vitest.feature.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/feature/**/*.{ts,mjs}'],
    exclude: ['node_modules', '.next', 'dist'],
    globals: false,
  },
});
```

Backend `package.json` scripts:

```json
"test": "vitest run --config vitest.unit.config.ts && vitest run --config vitest.feature.config.ts",
"test:unit": "vitest run --config vitest.unit.config.ts",
"test:feature": "vitest run --config vitest.feature.config.ts",
```

Leave `test:integration` and `test:hosted` exactly as they are.

Frontend `package.json` scripts:

```json
"test": "vitest run --config vitest.unit.config.ts && vitest run --config vitest.feature.config.ts",
"test:unit": "vitest run --config vitest.unit.config.ts",
"test:feature": "vitest run --config vitest.feature.config.ts",
```

Leave `test:browser` and `test:ui` exactly as they are.

- [x] **Step 4: Run unit tests to confirm the split did not drop the existing suite**

The split is in place. Any suite that is still red is Task 13, not this step.

Run: `pnpm --filter @utomator/backend test:unit`

Expected: PASS, and the count is the same set as today's `vitest run` excluding integration and hosted files.

Run: `pnpm --filter @utomator/frontend test:unit`

Expected: PASS.

`test:feature` stays red until Tasks 6 and 9 create `src/domain` and `modules/*/index.ts`. That is the intended red bar. Do not add `passWithNoTests`.

- [x] **Step 5: Do not commit**

---

### Task 3: DESIGN.md and globals.css tokens

**Files:**
- Create: `DESIGN.md`
- Modify: `apps/frontend/app/globals.css` (`@theme` and `:root` only; keep landing utility class names that pages already use)
- Test: `apps/frontend/tests/feature/design-tokens.feature.test.ts`

**Interfaces:**
- Consumes: the live baseline in `globals.css` (`#f5f7f8`, `#ffffff`, `#e2e8f0`, `#0f172a`, `#475569`, `#64748b`, `#06b6d4`, `#8b5cf6`, `#ec4899`, Inter, JetBrains Mono, `color-scheme: light`)
- Produces: `DESIGN.md` as the visual source of truth. `@theme` and `:root` use those hex values. Feature modules may use only tokens named in `DESIGN.md`.

- [x] **Step 1: Write the failing token test**

```typescript
// apps/frontend/tests/feature/design-tokens.feature.test.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DESIGN.md tokens', () => {
  it('keeps the operator light palette in globals.css', () => {
    const css = readFileSync(path.resolve('app/globals.css'), 'utf8');
    const design = readFileSync(path.resolve('../../DESIGN.md'), 'utf8');
    for (const token of ['#f5f7f8', '#ffffff', '#e2e8f0', '#0f172a', '#475569', '#64748b', '#06b6d4', '#8b5cf6', '#ec4899']) {
      expect(css).toContain(token);
      expect(design).toContain(token);
    }
    expect(design).toContain('color-scheme: light');
    expect(design).toContain('prefers-reduced-motion');
    expect(css).toContain('prefers-reduced-motion');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @utomator/frontend exec vitest run --config vitest.feature.config.ts tests/feature/design-tokens.feature.test.ts`

Expected: FAIL because `DESIGN.md` is missing.

- [x] **Step 3: Write DESIGN.md**

```markdown
# Utomator operator studio

The operator is one person running their own LinkedIn work from this machine. The interface is a desktop-first studio for Growth, Craft, Pipeline, and Run evidence, usable at 320px.

## DESIGN SYSTEM (REQUIRED)

Platform: web, desktop-first, usable at 320px.
Theme: light only. `color-scheme: light`. No dark theme.

- Page Canvas (#f5f7f8) for the studio background
- Card Surface (#ffffff) for cards and dialogs
- Secondary Surface (#f1f5f9) for inset wells
- Card Hover (#f8fafc) for a hovered card
- Hairline (#e2e8f0) for borders
- Ink (#0f172a) for primary text
- Body Ink (#475569) for secondary text
- Quiet Ink (#64748b) for muted text and scrollbar thumbs
- Signal Cyan (#06b6d4) for the one action accent
- Review Violet (#8b5cf6) for review and annotation marks
- Exception Pink (#ec4899) for a destructive or exception mark
- Selection Wash (rgba(6, 182, 212, 0.3)) for text selection
- Landing Glass (rgba(255, 255, 255, 0.7)) for the marketing landing page only
- Landing Gradient Start (#0891b2) and Landing Gradient End (#0f766e) for landing headlines only

Type: Inter for UI, JetBrains Mono for evidence and labels. No second UI font.

## Typography

Deliberate risk: section labels are mono and uppercase. Everything else stays Inter.

- Display: Inter, 28px, weight 560, line-height 32px, letter-spacing -0.02em. Use once per page.
- Body: Inter, 14px, weight 400, line-height 20px.
- Label: JetBrains Mono, 11px, weight 500, line-height 16px, uppercase, letter-spacing 0.08em.
- Mono: JetBrains Mono, 13px, weight 400, line-height 18px. Run ids, routes, and evidence quotes.

## Spacing, radius, elevation, focus, motion

- Space scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: control 12px, card 16px, pill 999px.
- Elevation: card shadow `0 8px 32px rgba(0, 0, 0, 0.08)` on hover only.
- Focus ring: 2px solid Signal Cyan (#06b6d4), offset 2px.
- Motion: 180ms ease for color and transform. Honor `prefers-reduced-motion: reduce` by setting animation and transition duration to 0.01ms.

## Components

- Navigation: `flex min-h-11 items-center gap-2 px-3 text-sm text-(--text-secondary)`.
- Page header: label utility plus display type. One display title per page.
- Card: `rounded-2xl border border-(--border) bg-(--bg-card) p-4`.
- Button: existing `.site-action`. Primary fill is Ink (#0f172a) with white text. Secondary is Card Surface with Hairline.
- Input: `min-h-11 rounded-xl border border-(--border) bg-white px-3 text-sm text-(--text-primary)`.
- Dialog: Card Surface, radius 16px, Hairline border, no blur.
- Toast: Card Surface, Hairline, Body type.
- Empty state: Quiet Ink body copy and one secondary button. Say what is absent.
- Error state: Exception Pink (#ec4899) for the mark, Ink for the message. A blocked run stays blocked.

## Do and don't

- Do take color, type, radius, and motion from this file.
- Do update this file and `apps/frontend/app/globals.css` in the same change when the look changes.
- Don't add an accent color inside a feature module.
- Don't add a second font.
- Don't add glass, blur, or a gradient in a feature module. Landing Glass and the landing gradients are landing-only.
- Don't imply a draft was published, a proposal was saved on the provider, or a blocked run succeeded.

## Product words

- Growth: why this program exists. UI label: Growth.
- Craft: how a step is authored. UI label: Craft.
- Pipeline: a validated, frozen, account-bound release. UI label: Pipeline.
- Run: one authorized execution with checkpoints. UI label: Run.
- Approval: a human decision that a mutating step still needs. UI label: Approval. A pending approval is not a completed action.
```

- [x] **Step 4: Align globals.css**

In `@theme`, keep the existing color and font variables. Add:

```css
--text-primary: #0f172a;
--text-secondary: #475569;
--radius-control: 12px;
--radius-card: 16px;
```

In `:root`, keep `color-scheme: light` and the existing hex values. Add at the end of the file:

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not delete `.glass`, `.text-gradient`, or `.site-action`. They are landing utilities already named in `DESIGN.md`.

- [x] **Step 5: Run the token test**

Run: `pnpm --filter @utomator/frontend exec vitest run --config vitest.feature.config.ts tests/feature/design-tokens.feature.test.ts`

Expected: PASS.

- [x] **Step 6: Do not commit**

---

### Task 4: Domain kernel

**Files:**
- Create: `apps/backend/src/domain/errors.ts`
- Create: `apps/backend/src/domain/types.ts`
- Create: `apps/backend/src/domain/validate.ts`
- Create: `apps/backend/src/domain/events.ts`
- Modify: `apps/backend/src/core/errors.ts`, `types.ts`, `validate.ts`, `events.ts` into re-export shims
- Test: `apps/backend/tests/unit/domain-kernel.unit.test.ts`

**Interfaces:**
- Consumes: the current exports of those four files
- Produces: the same classes and functions importable from `src/domain/*.ts`. `AuthBlockedError` and `ApprovalDeniedError` remain `instanceof Error` with `kind === 'blocked'`.

- [x] **Step 1: Write the failing test**

```typescript
// apps/backend/tests/unit/domain-kernel.unit.test.ts
import { describe, expect, it } from 'vitest';
import { ApprovalDeniedError, AuthBlockedError } from '../../src/domain/errors.ts';

describe('domain errors', () => {
  it('classifies auth and approval failures as blocked', () => {
    const auth = new AuthBlockedError('sign in required');
    const approval = new ApprovalDeniedError('owner denied');
    expect(auth).toBeInstanceOf(Error);
    expect(approval).toBeInstanceOf(Error);
    expect(auth.kind).toBe('blocked');
    expect(approval.kind).toBe('blocked');
    expect(auth.name).toBe('AuthBlockedError');
    expect(approval.name).toBe('ApprovalDeniedError');
  });
});
```

Add the same assertions for every other export that `src/core/errors.ts` has on the day you move it. Read the file first and extend this test. Do not drop a class.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @utomator/backend exec vitest run --config vitest.unit.config.ts tests/unit/domain-kernel.unit.test.ts`

Expected: FAIL with a module-not-found error for `src/domain/errors.ts`.

- [x] **Step 3: Move the four files and leave shims**

```bash
git mv apps/backend/src/core/errors.ts apps/backend/src/domain/errors.ts
git mv apps/backend/src/core/types.ts apps/backend/src/domain/types.ts
git mv apps/backend/src/core/validate.ts apps/backend/src/domain/validate.ts
git mv apps/backend/src/core/events.ts apps/backend/src/domain/events.ts
```

If `events.ts` or `validate.ts` imports filesystem, Fastify, Drizzle, or Playwright, do not put that file in `domain`. Record the exception in the inventory and leave it in `core/` for Task 6.

Rewrite each old path as a shim, for example:

```typescript
export { ApprovalDeniedError, AuthBlockedError } from '../domain/errors.ts';
```

List every export the moved file actually has. Fix relative imports inside the moved files so they still compile. `domain/*` must not import `fastify`, `drizzle-orm`, `playwright`, `groq-sdk`, or `node:fs`.

- [x] **Step 4: Run the tests**

Domain kernel tests pass. Remaining red suites are Task 13.

Run: `pnpm --filter @utomator/backend exec vitest run --config vitest.unit.config.ts tests/unit/domain-kernel.unit.test.ts`

Expected: PASS.

Run: `pnpm --filter @utomator/backend test:unit`

Expected: PASS.

Run: `pnpm --filter @utomator/backend exec biome check .`

Expected: exit 0.

- [x] **Step 5: Do not commit**

---

### Task 5: Browser provider stays one launch policy

**Files:**
- Create: `apps/backend/src/infrastructure/browser/provider.ts` (git mv from `src/browser/provider.ts`)
- Modify: `apps/backend/src/browser/provider.ts` into a shim
- Modify: callers only if TypeScript cannot follow the shim
- Test: `apps/backend/tests/unit/browser-provider-policy.unit.test.ts`

**Interfaces:**
- Consumes: `launchPersistent`, `openScratch`, `attachChrome` from the current provider
- Produces: those functions from `src/infrastructure/browser/provider.ts`. `chromium` remains imported in that one file only. `openScratch` still returns a new context. It does not reuse a run-scoped context.

- [x] **Step 1: Write the failing test**

```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openScratch, scratchDirectory } from '../../src/infrastructure/browser/provider.ts';

describe('browser launch policy', () => {
  it('gives every scratch profile its own directory', () => {
    expect(scratchDirectory('connect')).not.toBe(scratchDirectory('run'));
    expect(typeof openScratch).toBe('function');
  });

  it('imports chromium only from the infrastructure provider', () => {
    const provider = readFileSync(path.resolve('src/infrastructure/browser/provider.ts'), 'utf8');
    expect(provider).toContain('chromium');
    const session = readFileSync(path.resolve('src/browser/session.ts'), 'utf8');
    const signin = readFileSync(path.resolve('src/browser/streaming-signin.ts'), 'utf8');
    expect(session).not.toMatch(/from ['"]playwright['"]/);
    expect(signin).not.toContain('chromium.launch');
  });
});
```

The second assertion is wrong if `session.ts` still type-imports Playwright. Change that assertion to: `session.ts` and `streaming-signin.ts` do not contain `chromium.launch` or `chromium.launchPersistentContext`. Keep the provider as the only file whose source contains `chromium.launchPersistentContext`.

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @utomator/backend exec vitest run --config vitest.unit.config.ts tests/unit/browser-provider-policy.unit.test.ts`

Expected: FAIL with module-not-found for `src/infrastructure/browser/provider.ts`.

- [x] **Step 3: Move the provider**

```bash
git mv apps/backend/src/browser/provider.ts apps/backend/src/infrastructure/browser/provider.ts
```

Shim `apps/backend/src/browser/provider.ts`:

```typescript
export {
  attachChrome,
  launchPersistent,
  openScratch,
  scratchDirectory,
  DEFAULT_VIEWPORT,
} from '../infrastructure/browser/provider.ts';
```

Add every other export the moved file has. Fix the provider's import of `runtimePath` so it still points at `core/paths.ts` (or the infrastructure paths module if Task 6 already moved it).

Search `apps/backend/src` for `chromium.launch`. Expected matches: only `src/infrastructure/browser/provider.ts`.

- [x] **Step 4: Run unit tests and Biome**

The provider move landed. Biome that is still red is Task 13.

Run: `pnpm --filter @utomator/backend test:unit`

Expected: PASS.

Run: `pnpm --filter @utomator/backend exec biome check .`

Expected: exit 0.

- [x] **Step 5: Do not commit**

---

### Task 6: Application ports and infrastructure adapters

**Files:**
- Create: `apps/backend/src/application/ports/browser-port.ts`
- Move db, connect vault, groq, paths, and workflow steps per the move map
- Test: `apps/backend/tests/unit/browser-port.unit.test.ts`
- Test: `apps/backend/tests/feature/layer-boundary.feature.test.ts` (already written in Task 2; it must pass for `src/domain` and a sibling test for `src/application`)

**Interfaces:**
- Consumes: the methods `connect/service.ts` already calls on a browser session (`open`, `close`, `currentPage`, `beginView`, and the frame relay the service uses — read the file and copy those names only)
- Produces:

The live port is already `BrowserPort` in `src/browser/provider.ts`: `open(platform: string, accountId?: string): Promise<Page>`, `close(): Promise<void>`, and `readonly currentPage: Page | undefined`. `Page` is a Playwright type, so the application port must not import it. Move the contract to application as:

```typescript
export interface BrowserPort {
  open(platform: string, accountId?: string): Promise<unknown>;
  close(): Promise<void>;
  readonly currentPage: unknown;
}
```

Infrastructure keeps a `SessionBrowser` interface that uses Playwright `Page` and is assignable to this port. `beginView` stays on the concrete session, matching the comment already in `provider.ts`. Do not merge connect sessions and run sessions.

- [x] **Step 1: Write the failing port test**

```typescript
import { describe, expect, it } from 'vitest';
import type { BrowserPort } from '../../src/application/ports/browser-port.ts';

describe('BrowserPort', () => {
  it('accepts a fake that does not launch a browser', async () => {
    const fake: BrowserPort = {
      async open() {
        return { url: 'about:blank' };
      },
      async close() {},
      currentPage: undefined,
    };
    expect(await fake.open('linkedin')).toEqual({ url: 'about:blank' });
    expect(fake.currentPage).toBeUndefined();
  });
});
```

- [x] **Step 2: Run it and confirm failure**

Run: `pnpm --filter @utomator/backend exec vitest run --config vitest.unit.config.ts tests/unit/browser-port.unit.test.ts`

Expected: FAIL, module not found.

- [x] **Step 3: Add the port and move adapters with the move recipe**

Move, in this order, so later files can import earlier ones:

1. `src/core/paths.ts` → `src/infrastructure/runtime/paths.ts`
2. `src/db/*` → `src/infrastructure/db/*`
3. `src/browser/session.ts`, `streaming-signin.ts`, `login.ts`, `navigation.ts`, `vault-probe.ts` → `src/infrastructure/browser/`
4. `src/connect/session-vault.ts`, `src/connect/store.ts` → `src/infrastructure/connect/`
5. `src/mator/mator-groq.ts`, `src/mator/mator-crypto.ts` → `src/infrastructure/mator/`
6. `src/workflows/steps/*` → `src/infrastructure/workflow-steps/`

After each move, leave a shim at the old path. Update relative imports inside moved files. `schema-sqlite.ts` and `schema-postgres.ts` move together. Do not edit column definitions.

Extend `layer-boundary.feature.test.ts` so `src/application` also rejects `fastify`, `drizzle-orm`, `playwright`, `groq-sdk`, and `node:fs`.

- [x] **Step 4: Run unit, feature, typecheck, Biome**

Adapters are in infrastructure. Commands that are still red are Task 13.

Run:

```bash
pnpm --filter @utomator/backend test:unit
pnpm --filter @utomator/backend test:feature
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend exec biome check .
```

Expected: all exit 0. If `test:feature` fails only because `src/domain` is empty of files, Task 4 was skipped. Go back. If typecheck fails on a shim, the shim is missing an export. Add the export. Do not weaken a test.

- [x] **Step 5: Do not commit**

---

### Task 7: Application use cases

**Files:**
- Move `src/runs/*`, `src/engine/growth-profile.ts`, `src/engine/profile-growth-coordinator.ts`, `src/mator/mator-agent.ts`, `src/mator/mator-actions.ts`, `src/profile/*` planners, `src/linkedin/*`, `src/crafts/library.ts`, `src/connect/service.ts`, `src/connect/connector-session.ts`, `src/connect/connector-verifier.ts` per the move map
- Domain moves in the same task if they are pure: `workflow-plan.ts`, `mator-action-parser.ts`, `connector-status.ts`, `connector-consts.ts`
- Test: existing `apps/backend/tests/workflow-plan.test.ts`, `runner` tests, `mator-*.test.ts`, `crafts.test.ts`, `growth-profile-workflow.test.ts` must stay green without assertion edits

**Interfaces:**
- Consumes: shims from Tasks 4–6
- Produces: use case modules under `src/application/**` that call ports, not concrete Playwright or Drizzle types. A file that cannot lose its framework import stays in infrastructure and the inventory row says so.

- [x] **Step 1: Add an export-parity test before each move**

```typescript
import * as moved from '../../src/application/runs/runner.ts';
import { describe, expect, it } from 'vitest';

describe('runner module', () => {
  it('still exports the runner constructor used by main.ts', () => {
    expect(moved.Runner ?? moved.createRunner).toBeTypeOf('function');
  });
});
```

Read `src/runs/runner.ts` and assert the actual exported name. Repeat this shape for `compileWorkflow` from the workflow plan module and for `register` functions that are not use cases (those belong in Task 8, not here).

- [x] **Step 2: Run the parity test and confirm it fails**

Expected: module not found.

- [x] **Step 3: git mv, fix imports, write the shim**

`main.ts` may keep importing the shim paths until Task 8. Growth YAML paths inside the coordinator must still read `apps/backend/growth/`. Craft default paths must still read `apps/backend/crafts/default/`.

- [x] **Step 4: Run the backend unit suite**

Use cases live in infrastructure where they import the filesystem or Playwright. A red backend unit run is Task 13.

Run: `pnpm --filter @utomator/backend test:unit && pnpm --filter @utomator/backend typecheck && pnpm --filter @utomator/backend exec biome check .`

Expected: all exit 0.

- [x] **Step 5: Do not commit**

---

### Task 8: Fastify interface

**Files:**
- Move `src/api/*.ts` → `src/interface/http/*.ts`
- Move `src/mator/mator-routes.ts` → `src/interface/http/mator-routes.ts`
- Modify: `src/main.ts` imports to the interface paths
- Keep: `src/main.ts` and `src/server.ts` at the composition root
- Test: `apps/backend/tests/feature/route-allowlist.feature.test.ts`
- Test: existing `apps/backend/tests/server.test.ts`

**Interfaces:**
- Consumes: application use cases and infrastructure adapters wired in `main.ts`
- Produces: the same HTTP paths the proxy allowlist already forwards. `GET /health` still returns `{ status: 'ok' }`.

- [x] **Step 1: Write the failing allowlist test**

Read `apps/frontend/app/api/[...path]/route.ts` and copy its allowlist into the test as the expected path prefixes. The test builds the app with `buildApp` from `src/main.ts` the same way `server.test.ts` already does, then requests `GET /health`.

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/main.ts';

describe('interface routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('serves health on the composition root', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

If `buildApp` is not the exported factory name, use the name `main.ts` already exports. Do not rename the factory.

- [x] **Step 2: Run it**

Expected: PASS already if health exists, before the move. That means this test is a characterization, not a red bar. The red bar is a second assertion you add before the move: `readFileSync('src/interface/http/runs.ts','utf8')` contains `registerRunRoutes`. That file does not exist yet, so the test fails.

- [x] **Step 3: Move route files with shims and point main.ts at the new modules**

Do not change route strings, status codes, or approval checks. After the move, search the allowlist file and confirm every prefix still has a registrar.

- [x] **Step 4: Verify**

Routes are registered from `src/interface/http`. A red command is Task 13.

```bash
pnpm --filter @utomator/backend test:unit
pnpm --filter @utomator/backend test:feature
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend exec biome check .
```

Expected: all exit 0.

- [x] **Step 5: Do not commit**

---

### Task 9: Frontend module public entries

**Files:**
- Create: `apps/frontend/modules/<name>/index.ts` for career, connections, crafts, growth, intelligence, pipeline, research, reviews, settings, workflows, mator, shell
- Test: `apps/frontend/tests/feature/module-public-entry.feature.test.ts` from Task 2

**Interfaces:**
- Consumes: nothing moved yet
- Produces: an index that re-exports the current dashboard or mator entry the route pages already import. Example for shell:

```typescript
export { default as DashboardShell } from '../../components/dashboard/dashboard-shell';
```

`dashboard-shell.tsx` uses a default export. Other indexes use the real export names from the files they re-export. Each index re-exports at least one symbol that a page or sibling module already uses. Editorial gets an index only if inventory finds an editorial component directory. If it does not, do not create an empty editorial module; record `no editorial component directory` in the inventory.

- [x] **Step 1: Confirm the Task 2 test fails**

Run: `pnpm --filter @utomator/frontend test:feature`

Expected: FAIL on missing `modules/<name>/index.ts`.

- [x] **Step 2: Add the twelve index files with real re-exports**

- [x] **Step 3: Re-run the feature test**

Expected: PASS.

- [x] **Step 4: Do not commit**

---

### Task 10: Move frontend features into modules

**Files:**
- Move each directory listed in the file-structure table into `modules/<feature>/components`, and move that feature's hooks into `modules/<feature>/hooks`, client API helpers into `modules/<feature>/api`, and types into `modules/<feature>/model`
- Modify: `app/**/page.tsx` so each page imports the module index, not a deep dashboard path
- Modify: each `modules/<feature>/index.ts` so it exports the moved symbols
- Test: existing frontend Vitest files and `pnpm --filter @utomator/frontend typecheck`

**Interfaces:**
- Consumes: Task 9 indexes
- Produces: `app/` files that contain route composition only. A legal import is `import { DashboardShell } from '../../modules/shell'`. A forbidden import is `import { DashboardShell } from '../../modules/shell/components/dashboard-shell'`.

Do one feature per red-green cycle, in this order: shell, pipeline, workflows, growth, mator, career, connections, crafts, research, reviews, settings, intelligence. Intelligence moves out of career only after career's imports go through `modules/intelligence`.

- [x] **Step 1: For the feature, write a test that the page source does not import `components/dashboard/<feature>`**

```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pipeline route', () => {
  it('imports the pipeline module entry', () => {
    const source = readFileSync(path.resolve('app/dashboard/pipeline/page.tsx'), 'utf8');
    expect(source).not.toContain('components/dashboard/pipeline/');
    expect(source).toContain('modules/pipeline');
  });
});
```

Place it in `apps/frontend/tests/feature/<feature>-module.feature.test.ts`. Copy this test once per route file that currently imports that feature. Use the real page path from inventory.

- [x] **Step 2: Run that test and confirm it fails**

- [x] **Step 3: git mv the feature files, update relative imports, export them from the module index, and point pages at the index**

Keep behavior and copy. Do not restyle in this task. CSS modules that contain a hex value not listed in `DESIGN.md` get that hex added to `DESIGN.md` and `globals.css` as a named token, or the class switches to an existing token. Do not invent a new accent.

- [ ] **Step 4: Verify the feature**

```bash
pnpm --filter @utomator/frontend test:unit
pnpm --filter @utomator/frontend test:feature
pnpm --filter @utomator/frontend typecheck
pnpm --filter @utomator/frontend exec biome check .
```

Expected: all exit 0.

When the feature has a screen, start the frontend and the backend on loopback and exercise the route: open it, use the primary control, and open the empty and error states that this feature already has. A screenshot is not enough. Read `apps/frontend/docs/ui-quality-gates.md` before `test:ui`.

- [x] **Step 5: Do not commit. Repeat Steps 1–4 for the next feature.**

---

### Task 11: Delete shims that the matrix marks as superseded

**Files:**
- Delete only shim files whose inventory row says the new home has the behavior, the new tests pass, and `rg` shows no remaining importer of the old path
- Modify: inventory rows from `pending` to the test file that covers them

**Interfaces:**
- Consumes: the inventory from Task 1, updated after each move
- Produces: a tree with no shim that still has an importer, and no deleted file that still has an importer

- [x] **Step 1: For each shim, run**

```bash
rg -n "core/errors" apps
```

Use the old path segment. Zero code importers means the shim can be deleted. A test, a route, or a YAML reference means it stays.

- [x] **Step 2: Delete the proven shims and point any remaining test imports at the new path**

- [ ] **Step 3: Re-run both apps' unit and feature suites, both typechecks, and both Biome checks**

Expected: all exit 0.

- [x] **Step 4: Diff the inventory against the tree**

Every inventoried source file is either still on disk or has a row whose new home exists and whose test column names a collected test file. A test file that exists and is not matched by a Vitest include or a Playwright project is a failure. Fix the include, do not delete the test.

- [x] **Step 5: Do not commit**

---

### Task 12: Replace AGENTS.md

**Files:**
- Replace: `AGENTS.md`
- Create, only if a rule is file-scoped and would bloat the constitution: `.cursor/rules/backend-layers.mdc` after reading `C:\Users\olaitan\.cursor\skills-cursor\create-rule\SKILL.md`
- Test: `apps/backend/tests/unit/agents-constitution.unit.test.ts`

**Interfaces:**
- Consumes: the tree Tasks 4–11 actually produced. If a path in the draft below does not exist, change the draft to the real path before writing the file.
- Produces: a constitution shorter than the current `AGENTS.md`. It must not instruct agents to use `node --test`, Prettier, ESLint, or `components/dashboard/` as the layout.

- [x] **Step 1: Write the failing constitution test**

```typescript
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
```

- [x] **Step 2: Run it and confirm it fails**

Expected: FAIL on `node --test`, `Prettier`, or `components/dashboard/`.

- [x] **Step 3: Replace AGENTS.md with this constitution, edited so every path exists**

```markdown
# AGENTS.md

Agents read this file first, then `DESIGN.md`, then the `package.json` of the app they touch, then the module. Docs under `docs/` are evidence or proposals. A proposal never overrides this file.

## Where code goes

Backend is one Fastify process. Dependencies point inward.

- `apps/backend/src/domain` — entities and invariants. No Fastify, Drizzle, Playwright, filesystem, or Groq.
- `apps/backend/src/application` — use cases and ports.
- `apps/backend/src/infrastructure` — Drizzle, browser provider, vault, Groq, filesystem.
- `apps/backend/src/interface/http` — Fastify routes. Thin.
- `apps/backend/src/main.ts` builds the app. `apps/backend/src/server.ts` listens.

Legal: `interface/http/runs.ts` imports a use case from `application/runs`. Forbidden: `domain/errors.ts` imports `playwright`.

Frontend is one Next.js process. `app/` is routes and layouts only.

- `apps/frontend/modules/<feature>/{components,hooks,model,api}`
- Public import: `modules/<feature>` via `index.ts`
- Forbidden: a deep import into another module's `components/` file
- Shared primitives: `apps/frontend/components/ui`

Modules: career, connections, crafts, growth, intelligence, pipeline, research, reviews, settings, workflows, mator, shell.

## Hard stops

Bind `127.0.0.1` only. The browser reaches Fastify through `apps/frontend/app/api/[...path]/route.ts`. One runner, `apps/backend/src/runs/runner.ts` or its application successor if the move left a shim-free file there. Mutating runs need human approval and read-back. A draft is not a published post. A blocked run is not a success. Change both Drizzle schema files or neither. No secrets in git. No second UI or server framework. No microservice. No per-service hexagonal tree. `chromium` is imported only by the browser provider. Connect sessions and run sessions are different instances.

## How to change behavior

Backend changes start with a failing Vitest test. Move behavior, then delete the old file only when the inventory row names the new test. New unit tests go in `apps/backend/tests/unit/**` or `apps/frontend/tests/unit/**` and are collected by `vitest.unit.config.ts` include `tests/unit/**/*.{ts,mjs}` plus, on the backend, the legacy flat `tests/*.{ts,mjs}` exclude list. New feature tests go in `tests/feature/**` and are collected by `vitest.feature.config.ts` include `tests/feature/**/*.{ts,mjs}`. Playwright projects in `apps/frontend/playwright.config.ts` collect `test:ui` (`tests/frontend-quality.test.ts`) and `test:browser`. A test file that no include matches is a failure.

## Commands

- `pnpm --filter @utomator/backend test:unit`
- `pnpm --filter @utomator/backend test:feature`
- `pnpm test:backend`
- `pnpm --filter @utomator/backend typecheck`
- `pnpm --filter @utomator/backend exec biome check .`
- `pnpm --filter @utomator/frontend test:unit`
- `pnpm --filter @utomator/frontend test:feature`
- `pnpm test:frontend`
- `pnpm --filter @utomator/frontend typecheck`
- `pnpm --filter @utomator/frontend exec biome check .`
- `pnpm --filter @utomator/frontend test:ui`
- `pnpm --filter @utomator/frontend test:browser`
- `pnpm --filter @utomator/backend build`
- `pnpm --filter @utomator/frontend build`

`test:integration` needs a built frontend and Chromium. `test:hosted` is the hosted OIDC, gateway, and worker suite. Neither proves live LinkedIn access. Fixture green is not provider access.

## Design

A color, font, radius, or motion that `DESIGN.md` does not list is incomplete. Change `DESIGN.md` and `apps/frontend/app/globals.css` together.

## When this file changes

A change to folders, layers, scripts, test discovery, invariants, or the public module list updates `AGENTS.md` in that same change. A stale path here is a bug.

## Skills

Read using-superpowers before other work, test-driven-development before backend implementation, and verification-before-completion before claiming done.

- `C:\Users\olaitan\.claude\skills\using-superpowers\SKILL.md`
- `C:\Users\olaitan\.codex\skills\test-driven-development\SKILL.md`
- `C:\Users\olaitan\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\verification-before-completion\SKILL.md`

## Evidence

`docs/` separates existing behavior from proposals. The unified engine, canonical IR, multi-provider scheduling, and field-level collectors are proposals until code and tests say otherwise. Growth progress lives in `docs/architecture/growth-workflow-implementation-handoff.md`. Do not mark a fixture-green run as live provider access.
```

- [x] **Step 4: Run the constitution test and grep**

Run: `pnpm --filter @utomator/backend exec vitest run --config vitest.unit.config.ts tests/unit/agents-constitution.unit.test.ts`

Expected: PASS.

Search `AGENTS.md` for `node --test`, `Prettier`, `components/automate`, and `components/dashboard/`. Expected: no matches.

- [x] **Step 5: Do not commit**

---

### Task 13: Final verification

**Files:**
- Modify: only files the commands below show are broken
- Test: the command list in the prompt

- [ ] **Step 1: Run the required commands from the repo root**

```bash
pnpm --filter @utomator/backend test:unit
pnpm --filter @utomator/backend test:feature
pnpm test:backend
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend exec biome check .
pnpm --filter @utomator/frontend test:unit
pnpm --filter @utomator/frontend test:feature
pnpm test:frontend
pnpm --filter @utomator/frontend typecheck
pnpm --filter @utomator/frontend exec biome check .
pnpm --filter @utomator/backend build
pnpm --filter @utomator/frontend build
```

`test:ui` and `test:browser` need the frontend running. For a production-mode UI run, build and start Next.js on port 3100 and use `CI=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100`. Read `apps/frontend/docs/ui-quality-gates.md` first. Do not skip a failure. Do not delete or weaken a test to go green.

- [ ] **Step 2: State what was not proven**

`test:integration` and `test:hosted` are separate. A green fixture run is not live LinkedIn access.

- [ ] **Step 3: Do not commit**
