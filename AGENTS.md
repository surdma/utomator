# AGENTS.md

Agents read this file first, then `DESIGN.md`, then the `package.json` of the app they touch, then the module. Docs under `docs/` are evidence or proposals. A proposal never overrides this file.

## Where code goes

Backend is one Fastify process. Dependencies point inward.

- `apps/backend/src/domain` — entities and invariants. No Fastify, Drizzle, Playwright, filesystem, or Groq.
- `apps/backend/src/application` — use cases and ports. No framework imports.
- `apps/backend/src/infrastructure` — Drizzle, browser provider, vault, Groq, filesystem, and adapters that need them.
- `apps/backend/src/interface/http` — Fastify routes. Thin.
- `apps/backend/src/main.ts` builds the app. `apps/backend/src/server.ts` listens.

Legal: `interface/http/runs.ts` imports a use case from infrastructure or application. Forbidden: `domain/errors.ts` imports `playwright`.

Frontend is one Next.js process. `app/` is routes and layouts only.

- `apps/frontend/modules/<feature>/{components,hooks,model,api}`
- Public import: `modules/<feature>` via `index.ts`
- Forbidden: a deep import into another module's `components/` file
- Shared primitives: `apps/frontend/components/ui`

Modules: career, connections, crafts, editorial, growth, intelligence, pipeline, research, reviews, settings, workflows, mator, shell.

## Hard stops

Bind `127.0.0.1` only. The browser reaches Fastify through `apps/frontend/app/api/[...path]/route.ts`. One runner, `apps/backend/src/infrastructure/runs/runner.ts`. Mutating runs need human approval and read-back. A draft is not a published post. A blocked run is not a success. Change both Drizzle schema files (`infrastructure/db/schema-sqlite.ts` and `schema-postgres.ts`) or neither. No secrets in git. No second UI or server framework. No microservice. No per-service hexagonal tree. `chromium` is imported only by `infrastructure/browser/provider.ts`. Connect sessions and run sessions are different instances. `RunSummary.state='completed'` is not proof the runner is idle.

Growth stays YAML in `apps/backend/growth/*-workflow.yaml`. Adding a Growth is a YAML file, not a Next.js page. Craft defaults in `apps/backend/crafts/default/*.mdx` are read-only seeds. Workflow plans stay linear `start → session → action → finish`.

## How to change behavior

Backend changes start with a failing Vitest test. Move behavior, then delete the old file only when the inventory row names the new test. New unit tests go in `apps/backend/tests/unit/**` or `apps/frontend/tests/unit/**` and are collected by `vitest.unit.config.ts`. The backend unit include is `tests/*.{ts,mjs}` plus `tests/unit/**/*.{ts,mjs}`, excluding `tests/*.integration.test.ts` and `tests/hosted-*.test.mjs`. New feature tests go in `tests/feature/**` and are collected by `vitest.feature.config.ts` include `tests/feature/**/*.{ts,mjs}`. Playwright projects in `apps/frontend/playwright.config.ts` collect `test:ui` (`tests/frontend-quality.test.ts`) and `test:browser`. A test file that no include matches is a failure.

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

Format both apps with Biome. Do not run root `pnpm format` on backend files.

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

`docs/` separates existing behavior from proposals. The unified engine, canonical IR, multi-provider scheduling, field-level collectors, and the ARBHIL remote-browser design in `ARCHITECTURE.md` and `docs/architecture/arbhil.md` are proposals until code and tests say otherwise. Growth progress lives in `docs/architecture/growth-workflow-implementation-handoff.md`. Do not mark a fixture-green run as live provider access.
