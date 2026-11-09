# M3 pipeline-first task journaling: executable implementation plan

Date: 2026-11-04. Status: **PLANNED, production implementation blocked by checkout/CI**.
Tracks [M3 specification](../specs/2026-11-04-mator-m3-execution-journal-design.md) and [Mator handoff](../../architecture/mator-end-to-end-implementation-handoff.md).
Source baseline: PR #15 branch `work/mator-e2e-tracked-20261101` at `73d7992` before documentation commits; newer HEAD must always be refreshed.

## Preconditions that cannot be skipped

- Preserve all existing M1/M2 source code and the new directory organization (`src/runs/`, `src/workflows/`, `src/mator/`, `components/mator/`).
- Establish an executable checkout with Node 22 and pnpm 10; `pnpm install --frozen-lockfile` **currently fails** because the backend Vitest dependency specifier differs from `pnpm-lock.yaml` (GitHub Actions 41855468727 and 41855468761). Reconcile the manifest/lockfile without bypassing frozen lock; run installation before any production commit.
- Check `git status` and full PR #15 diff locally; no local Git checkout is present in this agent environment, so uncommitted local changes cannot currently be verified.
- Reconcile this branch's Vitest tests with outdated `AGENTS.md` Node-test-runner note; source scripts are authoritative. The isolated M3 projection tests currently use Node's runner and need migration into branch-conventional Vitest files.

## Critical path / dependencies

| ID | Lead owner and files | Red test, implementation and acceptance evidence | State |
|---|---|---|---|
| M3.1 | Investigator, Lead; `growth-profile.ts`, coordinator, Runner, API, Mator/artboard and tests | Actual data paths and safety invariants traced; review old-vs-current paths | INVESTIGATED |
| M3.2 | API/Contract + Security; `core/types.ts`, `workflows/workflow-yaml.ts`, document and SSE schemas | Contract cases: pinned identity, event/step ID validation, untrusted or wrong-run events | PLANNED |
| M3.3 | Backend; `runs/runner.ts`, `runs/plan-executor.ts`, `engine/profile-growth-coordinator.ts` | Test-first: step/attempt and checkpoint/evidence correlation through real emitters, no duplicate advancement | PLANNED |
| M3.4 | Backend + DB as needed; `core/events.ts`, `runs/run-archive.ts`, `api/runs.ts` | Test-first: restart/reconnect, durable cursor, ordered idempotent replay, truncated journal and terminal conflicts | PLANNED |
| M3.5 | API/Contract + Security; `api/runs.ts`, `api/growth.ts`, Next API allowlist | Test-first: owner-scoped run/journal/evidence and terminal event response contracts, sanitized errors | PLANNED |
| M3.6 | Frontend; new shared projection, `growth-graph-model.ts`, `use-growth-run-journal.ts` | An **isolated read-only candidate** passed 18/18 node tests + strict TypeScript check, but **not wired to repo**; adapt and expand Vitest tests; both consumers share projection | PLANNED (local prototype validated only) |
| M3.7 | UI/UX + Frontend; `components/mator/operator-chat-panel.tsx`, `chat/mator-task-block.tsx`, AI Elements | DOM tests reject fake done badges and full-width cards, verify expandable task hierarchy and mobile text | PLANNED |
| M3.8 | API + Frontend; `use-run-monitor.ts`, Mator chat hooks, checkpoint and evidence components | Test-first: POST authorized decision/input with `runId`+`checkpointId`, no fabricated completion, evidence bound to true step | PLANNED |
| M3.9 | Frontend; Growth graph/artboard consumers and Mator conversation/thread selectors | Test-first: one projection, old/new attempts isolated, per-thread switching and reload restores journal | PLANNED |
| M3.10 | Test Engineer; backend Vitest, frontend Vitest and Playwright 320/375/768/1024/1440 | Run **exact** commands below and capture console/log/screenshots; record mocks vs real integration | BLOCKED |
| M3.11 | Independent Reviewer, then Integration/Dogfood | Reject unverified auth, stale terminal, duplicate writes, unbound evidence and faux progress | BLOCKED |
| M3.12 | Git/Release | Review diff, local green gates, CI, update handoff+PR and change status only with evidence | BLOCKED |

## Ordered test-first slices

**Slice A: authoritative source / status projection (M3.2 + M3.6).** Use run-pinned `stages[].plan`, `programVersion` and `sourceDigest`, join `pipelineRuns[].childRunId`, then `StreamEvent.runId + id`, match recognized YAML step IDs only. Default waiting. Use failed/cancelled/approval/paused Runner state for active task. Never assign evidence to an unrelated task. **Acceptance:** tests explicitly cover wrong program/run/step, duplicate/order, stale current library, design-only, checkpoint, cleanup and no second advancement.

**Slice B: backend correlation (M3.3).** Add only necessary fields to existing Runner event emission; start/finish events, checkpoint IDs and evidence need exact step associations. Keep `executePlan` and single BrowserSession as sole executor. **Acceptance:** compiler and coordinator tests pass; no task can be marked complete from natural-language messages.

**Slice C: durable replay and authorized retrieval (M3.4–M3.5).** Use existing per-run JSONL and `RunArchive`; test replay over restart, cursor through reconnect, limit/truncation, owner scope and corrupt/missing journal. **Acceptance:** refresh shows recovered state, subscription never converts a missing journal into success, no cross-owner run or screenshot fetch.

**Slice D: actual chat and artboard (M3.7–M3.9).** Both bind to the same projected state. Replace `mator-task-block.tsx` blanket `done` mapping with nested pipeline cards; wire checkpoint/evidence to active authorized run. Preserve M1/M2, scrolling, per-workflow conversation state and the existing artboard topology. **Acceptance:** real test selection/switching/reload, 320px no overflow, relevant ARIA/reduced motion, no fake step badges.

**Slice E: independent testing, dogfood, release (M3.10–M3.12).** Verify browser checkout with real Fastify/Next; process actual local fixture-driven compiled YAML and Runner rather than making UI-only mocks pass. Record separate “real external provider unverified” unless credentials/consent exist. **Acceptance:** independent review accepts all blocking findings resolved, developer runtime and CI verified and PR remains draft until M1/M2/M4–M7 separate release gates pass.

## Exact baseline validation commands (after workspace installation)

```bash
pnpm install --frozen-lockfile
pnpm --filter @utomator/backend test
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend exec biome check .
pnpm --filter @utomator/backend build
pnpm --filter @utomator/frontend test
pnpm --filter @utomator/frontend typecheck
pnpm --filter @utomator/frontend build
pnpm --filter @utomator/frontend test:browser
```

Confirm package scripts before running; the branch has Vitest configuration even though older AGENTS notes say Node test. Backend `test:integration` and frontend Playwright test environments require local services/Chromium; build/start/test ordering should match the branch's current workflows. Capture command output, counts, failing test names, screenshot/trace paths and workflow link.

**Local prototype evidence**: executed `node --experimental-strip-types --test tests/growth-execution-projection.test.mjs` = 18/18 and `tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext lib/growth-execution-projection.ts` = success against two isolated files under `/mnt/data/mator-m3-local/apps/frontend/`; these commands are **not repo-wide CI or integration**.

## Hand-off / rollback rules

At each persona transition state: objective, verified source versions/paths, exact diff, tests, blocked checks, unresolved security/UX risks and next owner. If a backend contract change lacks frontend consumer/test updates, revert or keep off Git. If journal replay cannot be made durable or authorization correct, block M3 rather than shipping a simulated timeline. Any new DB schema requires migrations verified in both SQLite and PostgreSQL; prefer existing archive/documents when possible. Never fast-forward incomplete application source into PR #15 just to show commits.
