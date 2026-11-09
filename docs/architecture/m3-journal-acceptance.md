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

The test writes screenshots, a Playwright trace, process logs, `acceptance.json`, both child journals and the actual decoded SSE replay payloads under `apps/backend/.runtime/m3-acceptance/`. The replay record includes its requested cursor so a reviewer can compare the received events with the corresponding persisted-journal suffix. CI uploads that directory with the tested commit SHA in the artifact name. Inspect the JSON and trace, not just the workflow badge.

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
| Frontend full feature suite | 22 tests passed in 5 files, including Artboard refresh and footer truth regressions |
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

### CI investigation history

[Draft PR #30](https://github.com/surdma/utomator/pull/30) publishes this work. The first [M3 acceptance run](https://github.com/surdma/utomator/actions/runs/42600533720), for head `830d4d2aa90e58195d07b83273df611ac4b45bb2`, passed the unit/feature suites, builds, harness typecheck and Chromium installation. Its actual browser journey approved and resumed the first child, observed completed cleanup and 11/11 recorded tasks, and read the saved YAML, output and screenshot. It then failed because the test's pipeline-summary selector also selected nested event summaries. The correction uses only direct pipeline summaries. This first run is partial evidence, not a passing end-to-end result.

The uploaded failed-run evidence was downloaded and inspected, including `acceptance.json`, browser errors, screenshots and the trace. Screenshot review exposed a separate visibility defect: all six Artboard nodes became hidden after execution updates while their text remained in the DOM. The acceptance test now explicitly requires a visible completed node, so text-only assertions cannot certify this state. Both discoveries remain part of the history rather than being replaced by a later green badge.

The [second browser run](https://github.com/surdma/utomator/actions/runs/42601183969), at head `2c3ded27d777fdd3b51dfc71767708e590b3dc2c`, passed matching Mator completion and conversation switching before failing to click the hidden Artboard node. Independent trace review also found a background `/api/step-forms` HTTP 500 because the isolated fixture directory lacked the real YAML form configuration. A real child-process/HTTP probe reproduced that failure; copying the canonical configuration into the fixture changed the response to HTTP 200 with all 13 step kinds and byte-identical YAML. The harness now checks that endpoint before opening the UI and collects console errors and API 5xx responses as well as uncaught page errors. An empty page-error array from either failed run is not evidence of a clean console.

The Artboard correction retains React Flow's measured dimensions and selection while taking all task data and structure from the current canonical graph. Measurement scope matches the rendered template and pipeline view, so beginning a new run does not discard valid measurements and a task cannot inherit the measurement of a same-ID pipeline. Three real React Flow/component regressions cover live updates, first-run creation and that ID collision. The first two were observed failing before their corrections; all three then passed, followed by the full frontend suite and production build. Independent frontend and integration reviewers approved the correction and the strengthened harness before the next CI run.

The existing Artboard browser integration and responsive/accessibility jobs passed at the initial PR head. React Doctor `0.9.22` reported 3 errors and 145 warnings. An independent local comparison using the same version with optional supply-chain/network analysis disabled reproduced those exact counts; the unchanged base has the same 3 errors and 146 warnings. All three errors are inherited. One new warning concerns the complexity of the workflow controls; two baseline warnings were removed. These diagnostics remain visible, and the full quality gate is not waived.

The broader [integration run at the second head](https://github.com/surdma/utomator/actions/runs/42601183922) passed 20 of 21 browser scenarios, including a concurrent M3 journey, but failed the existing craft MDX link assertion in `tests/browser.integration.test.ts`. Its Artboard, typecheck and responsive/accessibility jobs passed. The [unchanged main integration run](https://github.com/surdma/utomator/actions/runs/42593220282) was also red in the same craft journey, at a later account-navigation assertion. Independent review reproduced an unchanged craft-editor race: a delayed background catalog response can replace unsaved MDX and cause Apply to submit the old links. The exact request body from the failing CI attempt was not captured, so that race is not asserted as its proven cause. The subsequent [integration job at `54e94f5`](https://github.com/surdma/utomator/actions/runs/42603289438) passed, including the broad browser suite and frontend connection tests. That later pass does not erase the separately reproduced craft-editor defect; the M3 fixes do not weaken its assertions or silently change craft editing.

### Successful controlled browser evidence

The [dedicated M3 run at `54e94f5`](https://github.com/surdma/utomator/actions/runs/42603288970) passed on November 9, 2026. Its [artifact](https://github.com/surdma/utomator/actions/runs/42603288970/artifacts/13666557898) was downloaded, its SHA256 verified as `12ab5170b481c3337fe0d7fe40e6ea505d2f7e33f592a5198a40a7fc0f5b2411`, and the JSON, screenshots and trace inspected. The tested PR merge commit `965082e5ce253bc6266c77159b0ae9b090664b00` and PR head `54e94f5ec9022ff4ec8aa194730b85f9ef76bb3c` have the same Git tree, `5e1e00fa73f5767d717b4585396bac7c4a8caeed`.

The successful record contains 58 ordered events, durable terminal event 58, and 28 exactly matching replayed events after the restart cursor. It verifies approval, pause/resume, cleanup, executed YAML/output/screenshot reads, Mator thread switching, task details, backend process restart, reload/navigation recovery, stage advancement, cancellation with cleanup, and design-only rejection. The final screenshots visibly show the completed identity pipeline and then the cancelled positioning pipeline in both Artboard and Mator. The stronger UI page/console/API error collection is empty. This is controlled application integration evidence, not live-provider certification.

That screenshot review exposed one remaining footer problem: the parent summary's `state` describes its current child, but the UI labelled it as completion of the whole Growth execution. It also bypassed the canonical journal projection. The follow-up footer now says `Current pipeline` and requires matching parent/program/version/source and current stage/child identities before displaying projected progress. Missing or incomplete proof stays unavailable; pending cleanup stays finalizing. Ten added component cases cover those boundaries, including one completed pipeline among six and a newly active child. The final browser harness also retains both fetched journals and the actual decoded replay payloads, and directly asserts the cancelled journal's terminal record and cleanup. These additions require their own final-commit CI record in the PR; the successful `54e94f5` evidence is not silently attributed to later code.

Current review and exact-commit CI results belong in the PR evidence record. Until the browser journey and independent release gates pass, M3 remains open and this change must not be represented as end-to-end accepted or release-ready. Do not auto-close issue #24 merely by merging code.
