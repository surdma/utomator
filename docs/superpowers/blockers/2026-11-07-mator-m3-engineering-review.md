# Mator M3: Engineering review and progress audit

**Review date:** 7 November 2026  
**Revalidation:** 8 November 2026, against PR #15 head `dc5a776f7a119ca38ba929b4b5f01ada43627a90`  
**Status:** M3 substantially implemented; **not release-ready**. Required quality gates are failing.  
**Scope:** [surdma/utomator PR #15](https://github.com/surdma/utomator/pull/15), stacked [PR #19](https://github.com/surdma/utomator/pull/19), repository source and exact-head CI logs.  
**Working remediation branch:** `work/mator-m3-m7-blockers-20261108`, forked from PR #15 head.

> This is a historical engineering review with a new evidence addendum, not a certification of a running system. Ratings are qualitative assessments, not coverage measurements. Update the findings and acceptance ledger whenever the code or required checks change; do not reuse green evidence from an earlier commit.

## 0. Verified GitHub checkpoint

- PR #19, the M3 implementation, merged on **7 November 2026 at 15:14:43 UTC** into PR #15's development branch, **not** `main`. Its merge commit is `dc5a776f7a119ca38ba929b4b5f01ada43627a90`.
- PR #15 is still **open, non-draft**, base `main`, head `work/mator-e2e-tracked-20261101` at that same SHA. The PR description says not to merge, so actual GitHub state and wording disagree.
- The merge includes backend journal persistence, task/run correlation, owner-scoped routes, a shared pipeline execution projection, and nested pipeline UI. These are implemented structures, not merely proposals.
- **Both exact-head workflows failed:** [Utomator integration run 42385438217](https://github.com/surdma/utomator/actions/runs/42385438217) and [code-quality run 42385438163](https://github.com/surdma/utomator/actions/runs/42385438163).
- The integration workflow has a separate important nuance: its first integration job failed at **frontend unit tests** (three unresolved alias suites), so downstream build, hosted and integration stages in **that job were skipped**. Do not report those skipped stages as passing or failing. Separate Artboard checks succeeded.
- The frontend browser-quality job completed at **56 passed / 32 failed**. The backend and frontend Biome jobs failed, as did React Doctor. Formatting steps passed.

## 1. Critical findings from the implementation review

| Priority | Finding | Consequence |
| --- | --- | --- |
| P0 | Current-head frontend Vitest cannot resolve `@/modules/pipeline` in three suites | Frontend unit/integration gate is red and the main integration job stops early |
| P0 | New Growth CRUD methods are absent from the Next.js API proxy allowlist | Browser clients cannot call Growth create/update/delete through the supported route |
| P0 | Growth detail/YAML/run routes still read file-backed definitions | Stored Growth templates may appear in catalogue yet fail to work as the authoritative definition |
| P0 | Journal failure branch allows memory-only broadcasts after a durable write fails | Live terminal state can be presented without replayable durable evidence |
| P1 | Groq model options still depend on a static catalogue | Live discovery, supported capabilities and account-aware availability remain unfinished |
| P1 | Temperature is stored in backend settings but missing from complete UI/API round trip | User-selected model configuration is incomplete |
| P1 | New-workspace default remains Profile Audit | Requested Profile Optimization default is not consistently implemented |
| P1 | Independent review, real-provider dogfood, cross-browser responsive acceptance missing | Functional completion and release cannot be certified |

### A. M3 journal reliability

The Runner's `emit` function in `apps/backend/src/infrastructure/runs/runner.ts` allocates events, writes to the file journal and then broadcasts. This correctly improves on publish-before-persist. However, when `active.journalFailed` is true, its current branch calls `this.events.broadcast(event)` and returns **without persisting**. The intent appears to be a terminal notice, but no explicit contract currently prevents consumers from treating this live-only event as durable history.

**Required correction:** Establish a separate `journal-failed` / `history-incomplete` terminal contract, prohibit subsequent task-success/approval evidence after write failure, and make SSE, paginated history, UI projection and restart replay agree. Inject failed writes, concurrent events, interruption and restart. A UI notice must never masquerade as replayable evidence.

### B. Growth database foundation, not a completed migration

`apps/backend/src/infrastructure/growth/growth-template-store.ts` provides a document-store-backed owner-scoped store with revision metadata and compare-and-swap writes.

In `apps/backend/src/interface/http/growth.ts`, `GET /growth/templates` appends stored records to file records. But `GET /growth/templates/:id`, `GET /growth/templates/:id/yaml`, and template-run endpoints use `readGrowthTemplate(id)`, the file-backed resolver. The result can be duplicate catalogue IDs or a catalogue item whose edited stored definition is not what the user sees or executes.

The public browser path goes through `apps/frontend/app/api/[...path]/route.ts`, where the Growth allowlist includes GETs and run POSTs but not `POST /growth/templates`, `PUT /growth/templates/:id` or `DELETE /growth/templates/:id`. The existing backend CRUD cannot function end to end through the intended Next proxy.

**Required correction:** Define one stable ID/version/source resolution contract; validate and compile YAML on write, implement owner enforcement, mutation lifecycles and safe duplicate IDs, and expose only the required CRUD routes with appropriate request validation. Preserve executable versus design-only classification and immutable running snapshots. Cover SQLite, PostgreSQL, tenant isolation and the real browser/API path.

### C. M3 scope and frontend regression surface

PR #19 changed **442 files**, including a broad frontend/backend module reorganization. Independent module boundary and consumer analysis is required. A specific reproduced failure is `apps/frontend/modules/mator/components/mator-api.ts` importing `@/modules/pipeline` while the frontend Vitest configurations omit path-alias resolution. The module exists at `apps/frontend/modules/pipeline/index.ts`; TypeScript's `paths` configuration alone does not make a Vitest runtime alias.

**Required correction:** Fix test-time module resolution across relevant configurations and run actual tests. Do not remove imports, weaken tests or relax failure thresholds as a workaround. Check relocated imports, public module surfaces, consumers and route navigation after this broad refactor.

## 2. Exact-head CI: release gate is red

**Commit:** `dc5a776f7a119ca38ba929b4b5f01ada43627a90`

| Check | Final result on reviewed head |
| --- | --- |
| Artboard focused unit/typecheck | Passed |
| Artboard real-browser integration | Passed; focused scenarios, not full product validation |
| Main integration job | **Failed** at frontend unit tests: 3 suites cannot resolve alias; 167 tests passed in suites that loaded |
| Main integration job later steps | **Skipped**, not validated |
| Responsive/accessibility Playwright | **56 passed, 32 failed**, across 88 outcomes |
| Frontend Biome lint | Failed; reported **53 errors, 54 warnings** |
| Backend Biome lint | Failed; reported **258 warnings** (review full logs for severity and ownership) |
| React Doctor | Failed; reviewed score **49/100** |
| GitGuardian / secrets | Reported passed in the 7 November audit; verify exact-head scope before carrying forward |
| Independent approval, real provider and linked-account dogfood | Not verified |

The [browser job in run 42385438217](https://github.com/surdma/utomator/actions/runs/42385438217) includes connector visibility, duplicate “Run history” accessible buttons, first-chat sends and placement/clipping at narrow viewports. These overlap the user-reported problems. Classify each failure against the actual head rather than assuming the suite is wrong.

**Release verdict: DO NOT MERGE PR #15 INTO MAIN.** Bring the PR's actual draft/release gate state into agreement with the warning in its description. No historical passing run can certify this commit.

## 3. Milestone scorecard

Ratings indicate end-to-end product readiness rather than proportion of code written.

| Milestone | Score | Assessment |
| --- | ---: | --- |
| M0: Investigation, architecture, tracking | **8/10** | Detailed specifications and handoffs exist; ledger and exact-head CI must be reconciled |
| M1: Chat, message rendering, approvals | **6.5/10** | Much implemented; first-message and narrow-screen regressions currently fail |
| M2: Voice, composer, attachments, history/settings UX | **6/10** | Text/voice routes exist; live device/provider proof and regressions remain |
| M3: Pipeline and journal | **7/10** | Core structures implemented; terminal durability, restart/replay and independent validation incomplete |
| M4: Groq configuration | **3/10** | Backend temperature foundation; live models, capability validation and UI persistence incomplete |
| M5: Stored Growth Library | **2/10** | CRUD foundation; missing proxy, source resolution, validation and lifecycle |
| M6: Profile Optimization default | **2/10** | Related source present, but audit still initializes new workspace |
| M7: Quality, integration, security, release | **2/10** | Test infrastructure substantial; exact-head gates red and dogfood absent |

**Overall end-to-end readiness: 4.5/10**, a provisional engineering assessment, not a test-coverage number.

## 4. M3 component-level status

| Component | Code status | Verification status |
| --- | --- | --- |
| M3.1 Runtime and dependency investigation | Done | Source traced |
| M3.2 Contract/specification | Documented | Reconcile with merged implementation |
| M3.3 Runner task identity/lifecycle | Implemented | Focused coverage; sign-off pending |
| M3.4 Journal and cursor pagination | Implemented | Write-failure/restart cases incomplete |
| M3.5 Owner-scoped API and SSE | Partially implemented | Negative authorization/restart replay pending |
| M3.6 Shared Growth execution projection | Implemented | Focused tests pass |
| M3.7 Nested pipeline/task UI | Implemented | Responsive acceptance pending |
| M3.8 Evidence and approvals | Partially implemented | Real workflow interaction not verified |
| M3.9 Chat/Artboard synchronization | Source implemented | Integration verification incomplete |
| M3.10 Complete test matrix | In progress | CI red on reviewed head |
| M3.11 Independent review and dogfood | Outstanding | No acceptance verdict |
| M3.12 Release readiness | Blocked | PR #15 must not merge |

Three meaningful improvements should be preserved: **pinned workflow definitions plus observed Runner events** rather than inferred completion; one shared pipeline projection across Mator and Artboard; and ordered event IDs/cursor pagination/corruption detection/write-before-broadcast in the journal. Do not rewrite M3 from scratch.

The still-unproven complete journey is: start an authorized workflow → inspect each pipeline/task → approve an action → observe correctly attributed evidence → reload or restart → continue with accurate history and terminal states.

## 5. Recovery sequence and acceptance gates

### Phase 1: Stabilize PR #15 (P0)

1. Reproduce and fix the `@/modules/pipeline` Vitest resolution in all three affected suites.
2. Triage each of the 32 Playwright failures; distinguish current regression, baseline, environment and test defect with traces. Prioritize first-message sending, duplicate Run History, connector navigation and narrow viewports.
3. Inspect the module reorganization for removed consumers, alias leakage, deep imports and route regressions.
4. Resolve Biome and React Doctor blockers without disabling rules, suppressing findings or loosening thresholds.

**Exit:** exact-head unit/feature, typecheck, production build, lint and browser suites green; no skipped required gate.

### Phase 2: Complete the M3 durable execution contract (P0)

1. Define one authoritative terminal history-incomplete state, fail closed after journal write errors and prevent ghost success broadcasts.
2. Validate owner-scoped journal replay, cursor ordering, event deduplication, run/task attempt evidence binding, checkpoint/approval correlation, cancellation/retry and storage corruption.
3. Run injection tests for more than 1,000 events, write failure, partial append, reload and service restart.
4. Exercise a full YAML → Runner → journal → Mator/Artboard journey.

**Exit:** after failure/reload/restart, UI cannot invent progress or lose recorded evidence; live-only notification is explicitly non-durable.

### Phase 3: Complete Growth persistence end to end (P0)

1. Make source resolution deterministic by stable ID/revision across catalogue, detail, YAML and execution routes.
2. On mutation compile and validate YAML server-side, enforce ownership and optimistic concurrency, protect immutable released snapshots.
3. Connect the exact required POST/PUT/DELETE routes through the Next allowlist with negative tests.
4. Implement draft, duplicate, lock, publish and archive lifecycle where supported by the defined contract; distinguish design-only from runnable programs.
5. Prove persistence, tenant isolation, SQLite/PostgreSQL behavior and the existing Growth Library UI contract.

**Exit:** create, reload, update, duplicate, lock, publish and retrieve through actual UI/API, without changing existing Growth Library layout or claiming design-only provider actions work.

### Phase 4: Groq and new-workspace default (P1)

1. Authenticate server-side live Groq model discovery; validate capabilities, account availability, rate limits and unavailability. Do not equate published pricing with account entitlements.
2. Wire default model and validated temperature through settings API, persisted state, UI and actual completion request.
3. Select Profile Optimization on *new* workspaces only, preserving user-saved workflows and never auto-running.

**Exit:** settings survive reload and change a verified Groq request; a new workspace defaults correctly.

### Phase 5: Independent product validation (P1)

1. Exercise Next → Fastify → document store/database → Runner → journal → Mator/Artboard, plus controlled Groq and authorized linked-account scenarios.
2. Test at **320, 375, 768, 1024 and 1440 px**, Chromium and WebKit, including chat, approvals, voice, file previews, keyboard focus, screen-reader semantics, and reduced motion.
3. Preserve screenshots, traces and test reports tied to the exact commit.

**Exit:** no blocking product regressions, including error/retry/restart cases, with reproducible evidence.

### Phase 6: Independent review and release (P1)

1. Independent Test Engineer, Security/Contract reviewer and Code Reviewer inspect the actual affected dependency graph.
2. Integration/Dogfood verifies the live user journey and failure semantics.
3. Reconcile the main Mator ledger against actual implementation and validation states.
4. Git/Release checks final diff, branch protections, exact-head CI, approvals and release decision.

**Exit:** all acceptance criteria met, required checks green, appropriate independent sign-off, and traceable merge authorization.

## 6. Architectural constraints and decisions

- **One Runner:** YAML specifies intent; persistent Runner evidence establishes what actually occurred. Do not add a parallel execution state machine in Mator or Artboard.
- **Template is not provider capability:** The existing 21 Growth definitions include design-only content. A YAML definition does not prove LinkedIn operations are implemented or authorized.
- **Owner and screenshot evidence are authorization contracts:** Preserve trusted server principal and test legacy ownerless-run access plus task-level evidence isolation before broad multi-tenant use.
- **Refactor is not feature acceptance:** Review the 442-file reorganization and its import/consumer paths separately from M3-specific tests.
- **Ledger must be current-head aware:** Distinguish `IMPLEMENTED`, `LOCALLY_VALIDATED`, `REVIEWED`, `INTEGRATION_VERIFIED`, `CI_VERIFIED` and `COMPLETE`. Older results must never override the current red head.
- **Guard working behavior:** Respect `AGENTS.md`, the supported Next proxy architecture, single Fastify process and approval/checkpoint policy. Where a proposed stored-template migration changes the current file-backed Growth invariant, update the governing contract and tests explicitly, not silently.

## 7. Final engineering verdict

| Dimension | Provisional rating |
| --- | ---: |
| Architecture and direction | **8/10** |
| M3 implementation maturity | **7/10** |
| M3 release readiness | **4/10** |
| Entire Mator end-to-end readiness | **4.5/10** |

**Do not rewrite M3. Do not merge PR #15.** Stabilize its exact-head CI first, then complete the durable execution contract and the incomplete M4–M6 integration. A 10/10 release means working, recoverable, authorized, independently exercised behavior with green release gates, not simply a commit per milestone.

### Verification boundary

This review uses GitHub source, PR history and completed CI logs. It does **not** claim a separate local checkout/build, a physical microphone/browser session, or live Groq/LinkedIn testing. The remediation branch creation is verified; production edits, local validation, independent acceptance and release are separate stages.
