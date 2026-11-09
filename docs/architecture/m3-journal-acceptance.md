# M3 journal correlation: acceptance and evidence

Issue: [#24](https://github.com/surdma/utomator/issues/24). Investigation base: `244af7e270ce83fb2940319a26a8d1a45dea7956`. Remediation branch: `work/m3-journal-correlation-issue-24`.

This ledger continues the [November 7 engineering review](../superpowers/blockers/2026-11-07-mator-m3-engineering-review.md) and the [Mator implementation handoff](mator-end-to-end-implementation-handoff.md). Earlier PR comments and test results describe their own revisions. They are not acceptance evidence for this change.

## Acceptance contract

YAML describes the intended tasks. A registered child Runner, its persisted ordered journal, and matching artifacts establish what happened. Completion requires a durable terminal record and successful browser cleanup. An unavailable journal, mismatched source, cancelled run, failed cleanup, owner-supplied note, or orphan screenshot cannot establish completed work.

The identity chain is:

`program ID + version + source digest → parent run → stage + compiled plan digest + attempt → registered child run → step digest + event ID → checkpoint/output/evidence`.

Every new run and review belongs to the trusted server principal. The browser cannot choose that principal by sending an owner header or request field. HTTP reads and writes deny missing, wrong, and legacy ownerless ownership, including indirect history reads through profile timelines and Mator activity memory.

Mator and `POST /runs` use the same saved-revision preparation boundary. A staged Mator run is pinned to its conversation workflow before approval; confirmation rejects a different workflow, changed revision, changed action inputs or foreign owner. The Runner receives the actual saved graph and authored step definitions. Reading a timeline uses a read-only archive view and never performs restart recovery on a live run.

## Six remaining works and their proof

| Issue #24 work | Implemented boundary | Required regression evidence |
| --- | --- | --- |
| 1. Durable failure behavior | Event IDs are reserved before persistence and published only after a successful append. A failed append rolls back the partial file before a bounded persistence retry. Browser actions are never replayed as a storage retry. Persistent failure produces truthful failed/incomplete history. | `tests/unit/runner-durability.test.ts`, `checkpoint-durability.test.ts`, `run-archive-durability.test.ts`: partial append, rollback failure, terminal/checkpoint/stop failures, cleanup, no ghost events, no leaked gates or evicted committed history. |
| 2. Restart, paging and reconnect | Logs and SSE replay the validated disk journal. SSE subscribes before replay, buffers live arrivals, verifies overlap, and resumes from `Last-Event-ID`. The frontend loads all pages and rejects corrupt or stalled cursors. | `tests/feature/m3-persisted-stream.test.ts`: real loopback HTTP, more than 1,000 persisted events, fresh Runner, reconnect, overlap/conflict, invalid cursor and disconnect. Frontend `tests/unit/growth-journal-paging.test.mjs`. |
| 3. Ownership and evidence isolation | Central owner checks protect run metadata, YAML, outputs, screenshots, decisions, input and lifecycle controls. Visual reviews, Growth, Mator starts, timelines and planning decisions preserve the trusted owner. | `tests/feature/m3-owned-run-access.test.ts`, `m3-worker-access.test.ts`, `m3-mator-run-binding.test.ts`; `tests/unit/m3-visual-ownership.test.ts`, `m3-timeline-ownership.test.ts`; Growth and Mator negative ownership tests. |
| 4. Source, task and child correlation | Growth stores the actual compiled stage/step digests and child identity. Events, outputs, screenshots and terminal summaries carry matching provenance. Cancellation aborts even if a stop event cannot be written. The Runner stays occupied through cleanup. | `tests/unit/growth-source-correlation.test.ts`, Runner durability tests, output/artifact identity tests, frontend `tests/unit/growth-provenance.test.mjs`. |
| 5. One truthful UI projection | Mator, Artboard and task details consume one shared Growth projection. Complete summaries cannot override incomplete journal evidence. Checkpoint state is scoped to the actual run/attempt/checkpoint. The Next proxy supports executed YAML and SSE reconnects and checks PATCH origins. | Frontend provenance, paging, graph and `tests/feature/growth-execution-ui.feature.test.mjs` behavior tests, plus the browser journey below. |
| 6. Real integration and independent review | A dedicated test starts the production Next app and real Fastify process, uses the single Runner and actual browser provider, persists to isolated SQLite/JSONL/artifacts, and restarts Fastify. | `tests/m3-journal.integration.test.ts`; the `Utomator M3 acceptance` GitHub Actions workflow; independent code/security review and release gate. |

Backend paths in this table are relative to `apps/backend`; frontend paths are relative to `apps/frontend`. These tests are collected by the existing unit, feature and integration configurations. No production browser or Runner substitute is used by the new browser journey.

## What the browser journey verifies

The provider HTML is a deterministic LinkedIn-shaped fixture. Connector discovery and verification use that HTML through the real BrowserSession. The test creates a real saved workflow and two persisted Mator conversations, then opens Profile auditing in the workspace.

It approves the evidence checkpoint through Mator, resumes the reviewed pause through the workspace, waits for cleanup and the durable terminal event, checks the actual executed YAML/output/screenshot routes, and compares completed progress in Mator, Artboard and task details. It switches the conversation, restarts the backend process, replays SSE through Next using `Last-Event-ID`, reloads and navigates the UI, advances to the next pipeline and cancels it. Design-only templates must still reject execution.

The test writes screenshots, a Playwright trace, process logs and `acceptance.json` under `apps/backend/.runtime/m3-acceptance/`. CI uploads that directory with the tested commit SHA in the artifact name. Inspect the JSON and trace, not just the workflow badge.

This proves the controlled application integration. It does not establish live LinkedIn account access, live Groq availability, a physical microphone, or external provider mutations. M3 does not implement those additional capabilities.

## Local commands

Use Node 22 or newer and the repository-pinned pnpm 10. From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @utomator/backend test
corepack pnpm --filter @utomator/frontend test
corepack pnpm --filter @utomator/backend typecheck
corepack pnpm --filter @utomator/backend build
corepack pnpm --filter @utomator/frontend build
corepack pnpm --filter @utomator/backend exec playwright install chromium
corepack pnpm --filter @utomator/backend exec vitest run --config vitest.integration.config.ts tests/m3-journal.integration.test.ts
```

On Linux, install the browser's operating-system dependencies if Playwright reports they are missing:

```sh
corepack pnpm --filter @utomator/backend exec playwright install --with-deps chromium
```

The M3 test creates and removes its own temporary database and starts both servers. It requires no `.env` credentials, no manually started server and no existing Chrome session. To inspect its trace:

```sh
corepack pnpm --filter @utomator/backend exec playwright show-trace .runtime/m3-acceptance/trace.zip
```

The broader repository browser and hosted gates remain separate:

```sh
corepack pnpm --filter @utomator/backend test:hosted
corepack pnpm --filter @utomator/backend db:push
```

In a second terminal, start the built frontend on the port expected by the existing browser tests:

```sh
corepack pnpm --filter @utomator/frontend exec next start -p 3100
```

Then run the existing full integration suite from the first terminal:

```sh
corepack pnpm --filter @utomator/backend test:integration
```

Repository-wide release quality gates are unchanged:

```sh
corepack pnpm --filter @utomator/backend exec biome format .
corepack pnpm --filter @utomator/backend exec biome lint --error-on-warnings .
corepack pnpm --filter @utomator/frontend exec biome format .
corepack pnpm --filter @utomator/frontend exec biome lint --error-on-warnings .
```

## Live account check, if required for a release

Run `corepack pnpm dev:backend` and `corepack pnpm dev:frontend` in separate terminals. Connect and explicitly verify your own LinkedIn account in the app. Open Profile auditing, approve the read-only evidence checkpoints, inspect each actual child YAML and persisted output, and confirm matching Mator/Artboard states after reload. Advance through the six dependent stages and finalize the evidence report; missing or owner-supplied evidence must retain its truthful label. Use a separate run to exercise cancellation.

Record the commit SHA, browser/OS, parent and child run IDs, source digest, terminal event IDs, screenshots and final report. Do not publish authentication cookies, account credentials, private profile content or unredacted runtime directories. A terminal command alone cannot verify an authenticated human review or provider consent.

## Legacy records

Old ownerless runs, approvals and reviews are denied. Old Growth records without pinned provenance cannot become completed by inference. Recreate the review or rerun the workflow under the current verified principal. There is no automatic migration that silently assigns someone else's legacy artifact to the current user. Keep old files as historical records if needed; do not manually add an owner field and treat that as verification.

An older staged Mator run proposal without a saved workflow revision must be staged again. Confirming an old proposal must not silently adopt the graph that happens to be current at approval time.

## Execution record and release decision

Local validation of the implementation on November 9, 2026 used Node `24.22.1` and the pinned pnpm `10.0.0`:

| Gate | Observed result |
| --- | --- |
| Backend full unit suite | 264 tests passed in 46 files |
| Backend full feature suite | 82 tests passed in 6 files |
| Frontend full unit suite | 220 tests passed in 44 files |
| Frontend full feature suite | 9 tests passed in 4 files |
| Hosted OIDC/gateway/real worker suite | 6 tests passed in 3 files |
| Backend typecheck and production build | Passed |
| Frontend production build, including TypeScript | Passed |
| Standalone TypeScript check of browser acceptance test | Passed |
| Independent backend review | Approved after reproducing and correcting the Resume persistence failure |
| Independent security/contract review | Approved after correcting live timeline recovery and replay wire normalization |
| Independent frontend review | Approved, including the final canonical workflow controls |
| Real Chromium journey in this environment | Blocked at browser startup; not an acceptance pass |

Independent review also exercised a completed Runner/coordinator stage, removed its committed terminal row, and verified that a fresh Runner rejected journal access and advancement. That controlled browser-adapter probe is failure-recovery evidence, not a successful Chromium run. The reviewed code includes post-answer cancellation checks for both approval and input, so a response immediately followed by Stop cannot release cancelled work.

The unchanged base passed 222 backend unit tests and 183 frontend unit tests and built the frontend successfully. Its strict lint gates were already red: backend reported 258 warnings and 125 informational diagnostics; frontend reported 52 errors, 54 warnings and 4 informational diagnostics. These results were run in a separate worktree at the base SHA. The final implementation still fails strict full lint: backend has 251 warnings and 144 informational diagnostics; frontend has 50 errors, 48 warnings and 1 informational diagnostic. These failures remain release blockers; no rule was relaxed. Introduced non-null assertion warnings in Runner and the new durability tests were removed. Informational suggestions are not suppressed.

The local real-browser attempt cannot start Chromium in the execution environment: Chromium fails at its process-singleton Unix socket with `Operation not permitted`. The fixture server was separately exercised over actual loopback HTTP: health, six-stage program retrieval, saved workflow creation and persisted conversation creation passed. The browser test is discoverable, type-checked and scoped-lint clean, but those checks do not count as browser acceptance.

Current review and exact-commit CI results belong in the PR evidence record. Until the browser journey and independent release gates pass, M3 remains open and this change must not be represented as end-to-end accepted or release-ready. Do not auto-close issue #24 merely by merging code.
