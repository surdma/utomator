# M3: Mator YAML pipeline execution journal and chat projection

Date: 2026-11-04
Status: **INVESTIGATED / PLANNED; NOT IMPLEMENTED IN THE APP**.
Branch: `work/mator-e2e-tracked-20261101` (PR #15, draft).
Owners: Engineering Lead; API/Contract, Backend, Frontend, Test, Security, Reviewer, Integration/Dogfood, Git/Release.

## User journeys and core guarantees

A user opens an authorized, versioned Growth YAML workflow. Mator and the Growth artboard show the same pinned pipeline definitions, with nested tasks initially **waiting**. Once the existing Runner actually executes a child plan, observed events move its tasks to running, checkpoint, completed, failed or cancelled. The user may inspect the corresponding journal and directly authorized evidence. A successful completion notification is never a substitute for output and browser cleanup. Refresh and switching threads must not mix events or re-label another attempt's work.

A pipeline that has a completed child but lacks evidence, required approval or browser release is not complete or advanceable. Design-only Growth YAML never gains execution badges. A recorded screenshot is not proof of a profile mutation. A TTS/AI-generated message does not change execution state.

## Evidence-backed execution path (current PR #15)

1. `apps/backend/src/engine/growth-profile.ts` loads restricted YAML, returns executable `GrowthProfileWorkflow`/`GrowthWorkflow` or design-only `GrowthBlueprintWorkflow`; executable stages have validated `stage.id`, `dependsOn`, and compiled `plan.steps[].id`.
2. `src/engine/profile-growth-coordinator.ts` snapshots `programId`, `programVersion`, `sourceDigest`, full `stages[].plan` and `childRunId` in `growth-runs` owner-scoped documents, then calls the existing `Runner.start`. Its `advance` checks completed child, Runner idle, required real `evidence/v1` and dependency chain.
3. `src/runs/runner.ts` assigns each child a UUID, stores YAML and per-step output snapshots and appends `StreamEvent` records into `.runtime/runs/<childRunId>.jsonl`. The in-memory `EventJournal` publishes to live SSE and retains only 1000 events. `src/runs/plan-executor.ts` emits `stepId` plus `stage: started|completed|failed|observation|evidence|...`. Approval/input checkpoint events currently carry `checkpointId`, but no `stepId`.
4. `src/api/runs.ts` exposes `GET /runs/:id/logs` from the persistent JSONL (last 1000 events), immutable step outputs, screenshot authorization, `GET /events/:id` SSE (in-memory only), and `POST /runs/:id/decision|input|cancel`. The Next proxy already allows these paths.
5. `apps/frontend/hooks/use-growth-run-journal.ts` polls child logs; `growth-graph-model.ts` derives limited step states using `details.stepId`, separate from Mator. `use-run-monitor.ts` subscribes to SSE and clears events on run change without persisted replay. `components/mator/chat/mator-task-block.tsx` currently marks *every* non-error event as done and passes `running={false}`. That is the concrete false-progress defect.
6. `src/mator/mator-conversations.ts` persists owner-scoped conversation messages, *not* authoritative Runner executions; don't mutate Mator message history to fabricate task journal entries.

## Canonical identity and compatibility contract

**Definition:** `programId` + pinned `programVersion` / `sourceDigest`; `stages[].id` is the UI **pipelineId**; `stage.plan.steps[].id` is **taskId**; `stages[].childRunId` is a **run attempt ID**. `StreamEvent.id` is the numeric sequence within the existing EventJournal; always key as `(childRunId, id)`, not by sequence alone. `time` is the recorded timestamp. The existing `stepId`, `stage` and `checkpointId` fields in `details` remain additive. Do not rename or break existing `StreamEvent` producers/consumers.

**Release:** use `ProfileGrowthRun.stages[].plan` stored at start for history, never unpinned current library YAML when versions differ. Do not infer pipeline identity from message text; join only via stored `stage.childRunId`. Current component schema has no general task-attempt IDs beyond run UUID; introducing retries requires unique child run IDs or an explicit attempt ID with compatibility checks.

**Status authority:** planned steps come from pinned YAML only. Only `kind='step'` and recognized `details.stage` can mark a task running/completed/failed. A terminal child Runner state overrides stale progress for its active task. Unknown or malformed events fail closed, never complete tasks. A completed child stays *finalizing* until coordinator conditions permit advancement, and previous stages must not advance twice.

**Checkpoint:** Match checkpoint `checkpointId` to the active run and step through the authoritative Runner pending-checkpoint state; do not match by natural-language message. UI submits only to existing authorized `/runs/:id/decision` or `/runs/:id/input`; receiving a 200 means answer was accepted, not task successfully completed. Until Runner emits checkpoint `stepId`, attribution requires `summary.currentStepId` with strict active-run checks. Ensure late approvals/rejections cannot mutate cancelled or superseded runs.

**Evidence:** screenshot links require exact run UUID, permitted filename, and explicit task identity from the emitting operation or verified immutable output. `Runner.isScreenshotAuthorized` only proves screenshot belongs to the *run*, not a task. **Do not assign unattributed screenshots to whichever task is currently selected.** A missing screenshot is missing evidence, not a successful action.

## Delivery, replay, recovery and security

The JSONL log is durable on the current local instance, while the SSE queue isn't persistent across restart. The frontend must read logs first and reconcile live SSE by `(childRunId,id)`; detect missing pages / journal truncation and show an explicit “history incomplete” state. Do not claim exact replay or subscriber catch-up until the server supports a persisted replay cursor; `GET /runs/:id/logs` currently returns only the last 1000. On restart, re-read `RunArchive` plus durable Growth run record; a process crash invalidates incomplete in-flight operations rather than pretending they completed. Preserve terminal conflict and retry invariants.

The app is currently loopback-only, but a loopback boundary is not a user/tenant authorization guarantee. The current `GET /runs/:id`, `/logs`, `/events/:id` and evidence routes lookup by run ID; examine how ownership is enforced at each route before exposing new aggregated run/evidence endpoints. Never leak account or credential material in logs. The existing `connectors.requireConnected` checks on Growth mutations stay in force; M3 must not loosen them.

## UI contract and layout

One narrow compact pipeline card per real Growth stage, with title, state, observed `completed/total` count and expandable nested task rows. Each task displays current state, timestamped journal, latest sanitized failure, checkpoint, and task-correlated evidence. Display planned structure before run as *waiting*, without fake event bubbles. Design-only stages are visibly non-executable. Respect 320/375/768/1024/1440 CSS px, keyboard/disclosure semantics, `aria-live` that doesn't announce every log line, reduced motion and no clipped long strings.

Chat and Growth artboard must derive from one shared typed projection, not parallel ad hoc step-state rules. Switching threads must maintain a workflow/conversation to run association: an arbitrary active account run must not be inserted into another workflow thread.

## Tests and release gates

Backend: real YAML compiler + Runner events + persisted JSONL, restart replay, terminal status, checkpoint owner binding, approval denial, cleanup and evidence, malformed/reordered/duplicate events, tenant isolation and unknown run ID.

Frontend: pinned old YAML, stage/task correlation, no fake completion, late stale event, cancellation, missing and cross-run screenshots, multiple runs/threads, 320–1440 layouts, disclosure/keyboard/reduced motion. Browser: real Next+Fastify with fixture Runner; live external provider separately labeled unverified without credentials.

Full Git gates: focused tests → backend/front typecheck/lint/build → DB integration as touched → Playwright → independent review → real dogfood → Git/CI. PR #15 remains draft.

## Work completed in this session and explicit limitations

- Reviewed current 2026-11-04 branch and PR state and traced current compiler, coordinator, Runner, event journal, archived runs, API proxy, Mator and artboard consumers.
- Prepared **an isolated projection candidate** (not added to repo or integrated). Node `--experimental-strip-types --test` passed **18/18** local tests; isolated `tsc --noEmit --strict ...` passed. The candidate is a source artifact for Frontend Engineer, not validated production code. Convert/verify tests with this branch's **Vitest** configuration.
- Current PR CI on head `73d7992` fails at `pnpm install --frozen-lockfile`: backend Vitest manifest change is not represented in the lockfile; job steps for app tests are skipped. Source-level code changes should not be committed until a runnable checkout/test lane can verify them.
- **No M3 backend/frontend production wiring has been completed, no real Runner execution, no Playwright or independent review/dogfood.**
