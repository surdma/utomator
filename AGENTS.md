# AGENTS.md

Instructions for coding agents working in this repository.

## Repository shape

- pnpm workspace (`apps/*`) with Turborepo. Node 22+, pnpm 10 (`corepack enable`).
- `apps/frontend` — Next.js 16 (React 19, Tailwind v4, React Flow), the operator UI and landing page.
- `apps/backend` — Fastify 5 + Playwright automation runner, Drizzle ORM, Biome. [`apps/backend/README.md`](apps/backend/README.md) is the deep product/architecture reference.
- Everything binds to loopback only (`127.0.0.1:3000` frontend, `:3101` API). Never configure reverse proxies, public hosts, or non-loopback CDP/DB exposure. Frontend rejects non-loopback hosts on purpose.
- `apps/backend/.runtime/`, `local.db`, and `.env` are gitignored local state (browser profiles, cookies, screenshots, run journals). Never commit them or reference them as durable data.

## Running and verifying

```sh
pnpm dev:automate                 # both apps + SQLite schema setup in one session
pnpm --filter @utomator/backend exec playwright install chromium   # once, before anything browser-related
pnpm test:backend
pnpm test:frontend
pnpm --filter @utomator/backend test:hosted        # hosted OIDC/gateway/worker suite
pnpm --filter @utomator/backend test:integration   # real-browser tests; needs built frontend + Chromium
pnpm --filter @utomator/backend typecheck && pnpm --filter @utomator/backend build
pnpm --filter @utomator/frontend typecheck && pnpm --filter @utomator/frontend build
```

- `scripts/dev-automate.mjs` reads `apps/backend/.env` and, when `DATABASE_URL` is unset, runs `db:push` to set up local SQLite. It also deletes an inherited `NODE_ENV=test` — a dev shell with `NODE_ENV=test` would silently disable the server.
- Frontend browser tests (`test:browser`, `test:ui`) and integration tests expect a running frontend (`next start -p 3100` pattern, see `.github/workflows/utomator-integration.yml`).

## Test framework gotcha (high signal)

Tests use **Node's built-in test runner only** — no vitest/jest exists anywhere.

- Backend `test` script passes an **explicit file list** to `node --test` (`.ts` tests via `--import tsx`, `.mjs` via type stripping). A new backend test file **won't run** until you add it to `package.json`.
- Frontend `test` script also passes an explicit file list (`node --experimental-strip-types`).
- `test:core` / standalone `node --test tests/*.test.mjs` runs only the stripped-types subset, not the `.ts` files.
- `tests/*.integration.test.ts` files are excluded from the default `test` script on purpose (they need a browser).

## Formatting and lint (CI gates differ from local scripts)

- Backend: Biome (`biome.json`: single quotes, semicolons, 105 width, src/tests only). CI runs **both** `biome format` and `biome lint --error-on-warnings`; the package `lint` script is lint-only and won't catch format drift. Check with `pnpm --filter @utomator/backend exec biome check .`.
- Frontend: Prettier (root `.prettierrc`, `printWidth: 80`, with `prettier-plugin-tailwindcss`) plus ESLint with `--max-warnings 0` in CI; CI's Prettier check is scoped to `apps/frontend` paths only.
- Do **not** run root `pnpm format` over backend code: Prettier (80 cols) and Biome (105 cols) disagree, and backend files are formatted by Biome only.

## Database: dual-dialect Drizzle

- No `DATABASE_URL` → SQLite (`file:local.db`, schema `src/db/schema-sqlite.ts`, drizzle out `drizzle/sqlite`). `DATABASE_URL` (must be `postgres://`) → PostgreSQL (`src/db/schema-postgres.ts`, out `drizzle/postgres`).
- Schema changes must be applied to **both** schema files; local uses `db:push`, shared Postgres uses real migrations (`db:generate` / `db:migrate` — migrations are deliberate, not regenerated).
- `drizzle.config.ts` loads `apps/backend/.env` via `dotenv/config`, so config comes from that file, not the shell.

## Architecture notes that aren't obvious from filenames

- Frontend never calls the backend directly: `app/api/[...path]/route.ts` proxies an **allowlist** of loopback Fastify endpoints (API + SSE). Any new backend endpoint must be added to that allowlist to be reachable from the UI.
- Backend entrypoints: `src/main.ts` exports the testable Fastify factory; `src/server.ts` is the unconditional executable (`dev` uses it, `start` uses `dist/server.js`).
- Two separate graph contracts exist today: **Craft** (`src/crafts/library.ts`) for authoring/editing and **WorkflowPlan** (`src/workflows/workflow-plan.ts`) for execution. `compileWorkflow()` accepts a WorkflowPlan, never Craft MDX — a rendered Craft graph cannot be run as a pipeline.
- **Growth = YAML-defined program over child WorkflowPlans**, not a new engine or page: restricted schema-validated YAML lives in `apps/backend/growth/*-workflow.yaml` (only `profile-workflow.yaml` and `branding-workflow.yaml` exist, both read-only `audit`/`audit-page`), compiled by `src/engine/growth-profile.ts` and orchestrated by `src/engine/profile-growth-coordinator.ts`. Templates are discovered dynamically via `GET /growth/templates` — adding a Growth means authoring a YAML file, **not** a Next.js page/component/custom controller. Task names must match real Runner step IDs; YAML may only refine titles, never operations or security.
- **One Runner** (`src/runs/runner.ts`) is the only browser execution engine; never create a second browser engine or auto-launch the browser on template load. `RunSummary.state='completed'` fires *before* `browser.close()` finishes — children may only advance when the Runner is truly idle (`isIdle()`, `releasePending`).
- Workflow plans are strictly validated linear `start → session → action → finish` plans (`WorkflowPlan` contract); arbitrary branching/merging is rejected by design. Plans persist as JSON under `.runtime/workflow-plans/`. Frozen per-step YAML run snapshots under `.runtime/runs/` are records, **not** executable input.
- The 21-item Growth catalogue is **15 planned LinkedIn capability definitions + 6 legacy MDX toolkits (guidance only)** — not 21 executable workflows. Don't advertise catalogue entries as runnable.
- Built-in Craft definitions (`apps/backend/crafts/default/*.mdx`) are seeded per-tenant and are **read-only** — users clone, defaults are never overwritten via API.
- The dashboard chat ("Mator") is a deterministic command interpreter plus an optional server-side Groq call — never implement it as autonomous browser/LLM actions. All mutating runs require human approval and read-back verification.
- Frontend: `components/automate/` is **gone**; dashboard code lives in `apps/frontend/components/dashboard/` grouped by feature (`career/`, `connections/`, `crafts/`, `editorial/`, `growth/`, `intelligence/`, `pipeline/`, `research/`, `reviews/`, `settings/`, `workflows/`), coordinated by `dashboard-shell.tsx` with page-local hooks (`use-workflow-workspace.ts`, `use-run-monitor.ts`, …). Beware: some docs (e.g. unified-engine "source anchors") still cite stale paths — verify paths before following them.
- Concept vocabulary: Growth = why; Craft = how; Graph = what; Pipeline = validated, frozen, account-bound release; Engine = authorized dispatch with checkpoints; Outcomes = evidence with attribution limits.

## Product invariants and documentation rules

- **Evidence honesty is a hard product invariant.** A draft is not a published post; a proposed profile change is not a completed edit; a manual owner task is not a provider operation; a read-only audit is not a field-level assessment. Never invent receipts, fabricate achievements, or report a blocked/failed run as success — preserve blocked/uncertain/manual states truthfully. Expert-derived methods capture the method, not the claimed outcome.
- New outcome data ⇒ create a **new Craft/pipeline version**; never retroactively edit an approved/released run.
- `docs/` distinguishes **existing vs proposed** explicitly. Start at `docs/README.md`. The unified execution engine, canonical IR, multi-provider scheduling, and 20 field-level collectors are proposals unless verified in code and tests. Maintain that boundary in code comments and responses.
- `docs/architecture/diagrams/`: Mermaid fences inside the architecture docs are authoritative; edit them and the matching `.mmd` sources together. The checked-in SVGs are deliberately simplified companions, not 1:1 renders.
- `docs/architecture/growth-workflow-implementation-handoff.md` is the **single canonical progress/handoff ledger** for the Growth YAML work. When work touches it, update that same file (status vocabulary `INVESTIGATED → IMPLEMENTED → TEST → REVIEW → DOGFOOD → GIT`); never resolve blockers without evidence, and never treat a green CI/browser-fixture run as proof of live LinkedIn access.
- README product claims (loopback-only binding, "two approvals for X delete post", no runtime AI dependency) are invariants; don't weaken them.
- Root `pnpm dev` / `build:all` / `lint:all` / `typecheck:all` run Turborepo tasks; `pnpm build` (`pnpm -r build`) is the plain recursive variant. Root has no lint of its own.
