# Backend Reorganization — Implementation Plan

Spec: `docs/superpowers/specs/2026-11-03-backend-reorganization-design.md`
Approach: A — Phased waves. One PR per wave. Every wave lands green
(`pnpm test:backend`, `typecheck`, `biome check .`, `test:hosted`).

Branches: `reorg/w1-browser-provider`, `reorg/w2-shared-stores`,
`reorg/w3-folder-realign`, `reorg/w4-file-splits`, each off the previous wave.

House rule for every task: behavior-preserving. If a diff changes runtime
behavior, that is a bug in the refactor, not a bonus.

---

## Wave 1 — Centralized Browser Provider

Target: `chromium` imported in exactly one file in `apps/backend/src`.

### W1.1 Create the provider module

- [ ] New file `apps/backend/src/browser/provider.ts` containing:
  - `launchPersistent(dir: string, overrides?: LaunchOverrides): Promise<BrowserContext>`
    — owns headless/viewport/acceptDownloads/timeout defaults (values taken
    verbatim from `session.ts:111-116`; no silent value changes).
  - `openScratch(label: string): Promise<{ context, page, dispose }>` —
    mkdir `.runtime/chrome/scratch/<label>` (mode 0o700) + launch +
    dispose = `context.close()` then `rm -rf`, byte-for-byte parity with
    `session.ts:166-179,208-212` and `streaming-signin.ts:174-186`.
  - `attachChrome(endpoint)` + `discoverRunningChrome()` + `localCdpUrl` —
    moved verbatim from `session.ts:11,16-53` (module-level singleton stays:
    one CDP transport per engine lifetime).
  - `assertLoopbackCdp(cdpUrl)` — extracted from `session.ts:88-93`.
- [ ] `session.ts` imports the provider; its own `chromium.*` calls are deleted.
- [ ] No behavior change in launch flags, timeouts, or gating env vars
      (`UTOMATOR_INTERNAL_OWNER_ID`, `UTOMATOR_DISABLE_CDP`,
      `UTOMATOR_BROWSER_MODE`).

### W1.2 Migrate the three consumers

- [ ] `session.ts` `open()` — persistent-profile branch calls
      `provider.launchPersistent`; CDP branch calls provider attach +
      `assertLoopbackCdp`; `openRestored()` calls `provider.openScratch`-style
      create (but keeps browser-hints replay + cookie seeding in `session.ts`).
- [ ] `streaming-signin.ts` `defaultLaunch` — reimplemented as a thin wrapper
      over `provider.openScratch(<uuid>-<platform>)`; `BrokerDeps.launch`
      injection seam unchanged (tests in `tests/connector-session.test.ts`
      and mator interaction tests keep passing unmodified).
- [ ] `connectors.ts` — `BrowserPort` interface moves to `provider.ts`,
      typed by what `ConnectorService` uses (`open/close/currentPage/
      beginView/frame/relay`); default param `() => new BrowserSession()`
      unchanged otherwise.
- [ ] `runner.ts:145` — unchanged call site (`new BrowserSession()`), now
      indirectly provider-backed. Runner is NOT refactored in this wave.

### W1.3 Shared screencast helper

- [ ] `provider.ts` exports `startScreencast(cdp, opts, onFrame)` including
      ack handling; port `session.ts:126-142` and `streaming-signin.ts:256-263`
      onto it. Quality/viewport params stay per-caller as values today.
- [ ] `mapBrokerInput` input mapping stays in `streaming-signin.ts`
      (already shared by consumers — do not move in this wave).

### W1.4 Verify Wave 1

- [ ] `grep "chromium" apps/backend/src` → matches `browser/provider.ts` only.
- [ ] `pnpm --filter @utomator/backend exec biome check .`
- [ ] `pnpm --filter @utomator/backend typecheck`
- [ ] `pnpm test:backend` (no test moves expected in this wave)
- [ ] `pnpm --filter @utomator/backend test:hosted`
- [ ] `pnpm --filter @utomator/backend test:integration` (real browser; needs
      built frontend + Chromium — run once before PR)
- [ ] Update `docs/architecture/diagrams/` mermaid sources + SVGs only where
      `browser/session.ts` launch responsibilities are cited.
- [ ] PR: `reorg/w1-browser-provider`.

## Wave 2 — Shared Backing-Store Extraction

Target: one `BackedStore` helper for the "document store → owner-isolated
JSON fallback → versioned compare-swap" pattern; no behavior differences.

### W2.1 Survey before extracting

- [ ] Read `career-store.ts`, `account-store.ts`, `workflow-store.ts`,
      `visual-review.ts`, `mator-conversations.ts` backing logic side by side
      with `connectors.ts:92-140`. Record which are verbatim-shaped vs
      deviating. Only verbatim-shape stores are migrated in this wave.
- [ ] Check whether the `this.mutation.then(...)` promise conveyor appears in
      more than one store; if exactly one, leave it in place (note in PR body).

### W2.2 Extract and migrate

- [ ] New `apps/backend/src/db/backed-store.ts` (small; record-shape agnostic;
      owner-isolation rule preserved: hosted tenants never read the local
      operator's JSON fallback).
- [ ] Migrate the surveyed stores one PR-comment-worth per commit, tests run
      after each migration (`database-documents.test.ts`,
      `tenant-isolation.test.ts`, `career-store.test.ts`,
      `account-store.test.ts`).
- [ ] Any store with real deviation keeps it; no force-fitting.

### W2.3 Verify Wave 2

- [ ] Full backend suite + hosted + `biome check .` + typecheck.
- [ ] PR: `reorg/w2-shared-stores`.

## Wave 3 — Folder/Naming Realignment

Target: `git mv` only. Import updates are mechanical. Endpoint paths,
concept names, and `engine/`, `crafts/`, `profile/`, `browser/`, `db/` stay
untouched.

### W3.1 Move files by domain

- [ ] `runs/`: `runner.ts`, `run-archive.ts`, `prompts.ts`, `approvals.ts`,
      `evidence-approval.ts`, `stream-tickets.ts`.
- [ ] `mator/`: all `core/mator-*.ts`.
- [ ] `workflows/`: `workflow-plan.ts`, `workflow-store.ts`,
      `workflow-registry.ts`, `workflow-yaml.ts`, `step-definitions.ts`,
      `step-forms.ts` (join `execute.ts`).
- [ ] `connect/`: `connectors.ts`, `session-vault.ts`.
- [ ] `linkedin/`: `linkedin-editorial.ts`, `linkedin-publisher.ts`,
      `linkedin-creator-research.ts`.
- [ ] `core/` residue = `types.ts`, `events.ts`, `validate.ts` only.

### W3.2 Fix the mechanical fallout

- [ ] Relative import path updates (`.js` suffix convention preserved).
- [ ] `package.json` `test` script explicit list updated the moment test
      files move — before committing the wave, not after.
- [ ] `biome check .`, typecheck, full suite, hosted, after each domain move
      (moves can land domain-by-domain within the wave).
- [ ] `workflows/execute.ts` tests / `growth-profile-workflow.test.ts` still
      named correctly; `tests/mator-*.test.ts` glob unaffected (mator only
      moves, not `tests/`).

### W3.3 Verify Wave 3

- [ ] Docs pass: `docs/architecture/diagrams/` and AGENTS.md get stale-path
      fixes **only where real paths moved** (AGENTS.md warns some docs cite
      stale paths — verify-before-edit, do not blanket-fix).
- [ ] Growth YAML handoff ledger: if any touched file is referenced there,
      update `docs/architecture/growth-workflow-implementation-handoff.md`
      with status vocabulary; growth behavior itself unchanged.
- [ ] PR: `reorg/w3-folder-realign`.

## Wave 4 — Split Oversized Files

Target: import-boundary reshuffles only; zero logic edits. `buildApp`
contract (`server.test.ts`) untouched.

### W4.1 main.ts (1,664)

- [ ] New `apps/backend/src/api/` modules, one per domain (`connectors.ts`,
      `runs.ts`, `mator.ts`, `crafts.ts`, `editorial.ts`, `growth.ts`,
      `intelligence.ts`, ...), each exporting a register function taking its
      already-built dependencies.
- [ ] `main.ts` becomes a thin composer; dependency construction order kept.
- [ ] Frontend proxy allowlist unaffected (route strings unchanged).

### W4.2 connectors.ts (950)

- [ ] `connect/store.ts` (records/update/mutation conveyor),
      `connect/service.ts` (session lifecycle + verification),
      `connect/routes.ts` (HTTP registration).
- [ ] Move the Wave-1 `BrowserPort` consumption along with the service.

### W4.3 execute.ts (858) + runner.ts (612)

- [ ] `workflows/execute.ts` → step implementations grouped by step family;
      step registry shape unchanged.
- [ ] `runs/runner.ts` → run-lifecycle vs journal/archive concern files.
      Still ONE Runner; no second engine.

### W4.4 Verify Wave 4

- [ ] Full gates per house rule; `test:integration` at the finale.
- [ ] Final sweep: `grep chromium` still provider-only; line-count table
      re-run to document the before/after in the PR.
- [ ] PR: `reorg/w4-file-splits`.

---

## Verification matrix (per wave, before PR)

1. `pnpm test:backend`
2. `pnpm --filter @utomator/backend typecheck && pnpm --filter @utomator/backend build`
3. `pnpm --filter @utomator/backend exec biome check .` (CI variant, not `lint` script)
4. `pnpm --filter @utomator/backend test:hosted`
5. `test:integration` — after W1 and at W4 finale only (needs built frontend + Chromium)
6. Frontend untouched by design; run `pnpm test:frontend` once at W4 finale to prove it.
