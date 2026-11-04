# Backend Reorganization — Design

Date: 2026-11-03
Status: Approved (pending implementation plan)
Approach: A — Phased waves; one PR per wave; every wave lands green.

## Problem

The backend has accumulated three independent Playwright acquisition paths,
oversized multi-purpose files, and repeated persistence/launch logic, making it
hard to manage.

## Verified facts (2026-11-03 code audit)

Three browser acquisition paths exist:

1. `browser/session.ts` (`chromium.launchPersistentContext` at lines 111, 169)
   — used by `core/runner.ts:145` via inline `new BrowserSession()`, per run.
2. `core/connectors.ts:84` — `ConnectorService` factory creates its own
   `new BrowserSession()` instances (connect sync/verify/sign-in).
3. `browser/streaming-signin.ts:176` — `SignInBroker.defaultLaunch` creates its
   own scratch persistent context, bypassing `BrowserSession` entirely.

Concrete duplication:

- Two near-identical `launchPersistentContext` option blocks
  (`session.ts:111`, `streaming-signin.ts:176`).
- Scratch-profile create/dispose logic written twice (`session.ts:166-179, 208-212`
  vs `streaming-signin.ts:174-186`).
- CDP screencast plumbing duplicated (`session.ts:126-142` vs
  `streaming-signin.ts:256-263`).
- `connectors.ts` couples to the concrete `BrowserSession` class via
  `BrowserPort = Pick<BrowserSession, ...>` (`connectors.ts:25`).

Oversized files (lines): `main.ts` 1664, `core/connectors.ts` 950,
`workflows/execute.ts` 858, `core/mator-actions.ts` 667, `core/runner.ts` 612,
`core/mator-routes.ts` 557, `crafts/library.ts` 527, `core/workflow-plan.ts` 523.

Bonding layout truth: `core/` holds 18+ unrelated files (runs, mator, connector,
linkedin, workflow, visual-review). Only `browser/`, `crafts/`, `db/`,
`engine/`, `profile/`, `workflows/` are domain-scoped today.

## Correcting the original claim

The problem is not that one browser instance should be shared. A short-lived
connect-sync session and a run-scoped session have intentionally different
lifecycles; sharing one instance would serialize runs. The real problem is the
absence of a single launch-policy owner. Fix: a centralized browser provider
(factory), so three paths share policy, CDP attach, scratch lifecycle, and
screencast handling instead of restating them.

## Wave 1 — Centralized Browser Provider

New module `src/browser/provider.ts`. After Wave 1, `chromium` is imported in
exactly one file in `src/`.

Responsibilities moved into the provider:

1. **Launch policy** — one `launchPersistent(dir, overrides?)` used by every
   path: `headless: true`, `acceptDownloads: false`, default viewport/timeout.
2. **CDP attach singleton** — `attachChrome()`, `discoverRunningChrome()`,
   `127.0.0.1:9222` discovery, and loopback-host validation, conforming to
   existing behavior from `session.ts:18-53, 88-93`. One transport for engine
   lifetime; never `Browser.close()` on external Chrome.
3. **Scratch profile lifecycle** — single `openScratch(label)` returning
   `{ context, page, dispose }`, replacing the duplicated mkdir/launch/rm logic.
4. **Screencast helper** — shared `startScreencast(cdp, opts, onFrame)` with
   frame-ack handling; both `BrowserSession.beginView()` and `SignInBroker`
   delegate to it.

Consumer changes (edge-only):

- `BrowserSession` keeps its class; delegates launch/CDP/scratch to provider.
- `SignInBroker.defaultLaunch` becomes a thin wrapper over the provider; the
  `launch` injection seam stays for tests.
- `BrowserPort` interface moves to provider.ts, defined by what
  `ConnectorService` actually uses (`open/close/currentPage/beginView/frame/relay`).
- Vault restore (`openRestored`) keeps its browser-hints replay inside
  `session.ts` (payload-coupled) but launches via the provider.

Non-goals / invariants preserved:

- The provider is a factory, not a shared instance. Lifecycle separation stays.
- One Runner; no second execution engine is created.
- Local-vs-hosted gating (`UTOMATOR_INTERNAL_OWNER_ID`, `UTOMATOR_DISABLE_CDP`,
  `UTOMATOR_BROWSER_MODE`) and loopback-only CDP enforcement move, never weaken.

Exit criteria: `grep chromium` in `src/` matches only `browser/provider.ts`;
`pnpm test:backend`, `typecheck`, `biome check .` pass; `test:hosted` passes;
`test:integration` runs once after the wave lands.

## Wave 2 — Extract shared duplicated logic (behavior-preserving)

- **Backing-store pattern**: the "Drizzle document store → owner-isolated JSON
  fallback → versioned compare-swap write" implemented in
  `ConnectorService.records()/update()` (`connectors.ts:92-140`) recurs in
  `career-store.ts`, `account-store.ts`, `workflow-store.ts`,
  `visual-review.ts`. Extract a small `BackedStore` helper; each store keeps its
  domain record types. Stores with genuine deviations (e.g. method-level
  authorization in `account-store.ts`) keep them. No force-fitting.
- **Mutation conveyor**: the promise-queue mutex in `connectors.ts` becomes a
  shared utility if the same conveyor appears elsewhere; otherwise stays.
- Additional extractions only when duplication is verbatim or near-verbatim.
  "Similar" is not "duplicate".

## Wave 3 — Folder/naming realignment

`git mv` only (history-preserving). `core/` becomes a dumping ground no more:

| Domain | Moved files |
|--------|-------------|
| `runs/` | `runner.ts`, `run-archive.ts`, `prompts.ts`, `approvals.ts`, `evidence-approval.ts`, `stream-tickets.ts` |
| `mator/` | all `mator-*.ts` |
| `workflows/` | `workflow-plan.ts`, `workflow-store.ts`, `workflow-registry.ts`, `workflow-yaml.ts`, `step-definitions.ts`, `step-forms.ts` (join `execute.ts`) |
| `connect/` | `connectors.ts`, `session-vault.ts` |
| `linkedin/` | `linkedin-editorial.ts`, `linkedin-publisher.ts`, `linkedin-creator-research.ts` |
| `core/` shrinks to | cross-cutting only: `types.ts`, `events.ts`, `validate.ts` |

Left alone deliberately: `engine/` (canonical Growth YAML handoff ledger governs
that area; not churned here), `crafts/`, `profile/`, `browser/`, `db/`.
No concept renames; endpoint paths unchanged (frontend proxy allowlist depends
on route strings that live in `main.ts`).

Trap explicitly handled: the backend `test` script passes an explicit file list;
any test file move updates that list the moment the move happens or tests
silently stop running.

## Wave 4 — Split oversized files

- `main.ts` → per-domain route registration modules
  (`api/connectors.ts`, `api/runs.ts`, `api/mator.ts`, ...); `buildApp`
  contract from `server.test.ts` unchanged.
- `connectors.ts` → `connect/store.ts` (persistence), `connect/service.ts`
  (session lifecycle + verification), `connect/routes.ts` (HTTP).
- `workflows/execute.ts` → step implementations by step family.
- `runner.ts` → run lifecycle vs journal/archive concerns. Splitting is
  internal; one Runner is untouched.

All Wave 4 splits are import-boundary reshuffles with zero logic edits.

## Verification strategy (every wave)

- `pnpm test:backend` (explicit test file list updated with any test move),
  `pnpm --filter @utomator/backend typecheck`,
  `pnpm --filter @utomator/backend exec biome check .` (the CI variant),
  `pnpm --filter @utomator/backend test:hosted`.
- `test:integration` (real browser) after Wave 1 and at the finale.
- `docs/architecture/diagrams/` mermaid sources and SVG companions updated
  only where file paths are cited. AGENTS.md updated surgically for path moves.
- One PR per wave, independently revertable.
