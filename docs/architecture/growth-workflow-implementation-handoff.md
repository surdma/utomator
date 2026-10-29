# Growth YAML → Pipeline artboard: architecture and running handoff

> **Single canonical progress/handoff record.** Updated 2026-10-29, Africa/Lagos. Repository: `surdma/utomator`. Target: draft PR [#7](https://github.com/surdma/utomator/pull/7), stacked on draft [#6](https://github.com/surdma/utomator/pull/6). Do not confuse a child PR merged into its parent branch with a merge into `main`.

## 1. User outcome and acceptance

A Growth is an objective with requirements and a versioned YAML workflow. From the **existing Pipeline → Templates modal**, load a Growth onto the **existing workflow artboard**. The parent graph contains connected **pipelines**. Selecting one drills into the connected **tasks/actions/steps** that actually execute it. Each child pipeline establishes its own session/account/authentication and uses the existing Runner for evidence, approvals, real provider actions and verification. A failed child task must be identifiable by actual step ID and must give the parent pipeline a red border and inspectable error/journal.

**Acceptance criteria:** (A) no bespoke Growth page or parallel Runner; (B) catalogue discovers reviewed YAML dynamically and cannot accidentally launch the browser on template load; (C) parent connections and child task links reflect compiled YAML; (D) task failure is attributed to the real task, with red parent pipeline; (E) an authenticated child cannot advance until verified evidence, approval **and browser cleanup**; (F) invalid YAML/actions/task bindings fail closed; (G) backend + frontend + real-browser-fixture regression tests and independent review pass; (H) no claim of real LinkedIn or 20 field edits without live evidence; (I) no regression of saved workflows, Craft/MDX, Research and Editorial.

The present 21-item Growth library is **15 LinkedIn capability definitions and 6 legacy MDX toolkits**, **not** 21 executable YAML workflows. Only `linkedin-profile` has authored executable YAML today; other entries must remain planned/guidance until fully implemented and verified.

## 2. Architecture decisions (ADRs)

| ID | Decision | Verified rationale / constraint |
|---|---|---|
| 01 | Reuse Pipeline artboard and its **existing Templates modal** | Avoid a new route/template editor for every Growth; old `/growth/default-growth-profile` redirects to Pipeline |
| 02 | Model `Growth → dependent pipeline graph → each pipeline's connected task graph` | A coverage target isn't a task; task links must be the ones the Runner executes |
| 03 | One existing `Runner`, never a second engine | The coordinator only schedules child runs, using existing account/session, approvals, cancellation and evidence |
| 04 | Restricted YAML compiles to validated `WorkflowPlan` | YAML may override reviewed task titles only, not operation, typed binding, or provider permissions |
| 05 | Pin plan, source digest and version when a Growth run starts | Editing a source file must not silently change an active run |
| 06 | Distinguish page evidence, owner-supplied text and independently provider-verified field data | An audit result cannot imply 20 completed section reviews or actual external profile edits |
| 07 | **A completed child summary is not yet an idle Runner** | `Runner.start` sets completed before awaiting `browser.close()`; advancement requires a released browser |
| 08 | Preserve legacy MDX and specialized Research/Editorial | No lossless migration or live equivalence yet; removing them would be a regression |

**Current model (serial restricted subset):**
```text
Pipeline → Templates modal
  → GET /growth/templates (validated YAML catalogue)
  → Load Growth (read-only selection; no Runner launch)
  → existing workflow artboard
      Growth pipeline A ──dependsOn──> pipeline B ──> ...
       └── Select A → task graph from compiled WorkflowPlan
           start → session/auth → observe → evidence → approve → action → verify → output
                                     └─ failure + currentStepId ──> parent RED
  → POST /growth/templates/:id/runs (requires verified connected owner)
  → Runner.start(pinned child plan)
  → child completes → browser closes → archive evidence → operator advances
```

**Scope ceiling:** The current YAML compiler is still `GrowthProfileWorkflow`, LinkedIn-profile-centric, with `audit` and `audit-page` only; its stage dependencies are serial. Arbitrary branching/fan-in, variable provider tasks, editing parameters, visual graph editing and 20 independent field extractors **are not implemented**. Generalizing requires a reviewed schema/contract migration and cannot be achieved by making read-only node cards look editable.

## 3. Verified execution and dependency trace

| Layer | Actual file(s) | Contract |
|---|---|---|
| Definition | `apps/backend/growth/profile-workflow.yaml` | six dependent read-only pipelines, 20 independent coverage records, named registered tasks |
| YAML catalogue/compile | `apps/backend/src/engine/growth-profile.ts` | restricted parser, task/stage validation, `linkedinPipeline`, `compileWorkflow`, `*-workflow.yaml` discovery |
| Parent coordinator | `apps/backend/src/engine/profile-growth-coordinator.ts` | pinned child plans, `Runner.start/get/stepOutput`, stages, owner evidence, `advance`, `releasePending` |
| Execution/evidence | `apps/backend/src/core/runner.ts` | real browser account/session, task journal, immutable output artifacts, approvals, cleanup, `isIdle()` |
| Persistence | `apps/backend/src/db/documents.ts`, `growth-runs` + Runner archive | stored run/stage state and source digest; no synthetic field verification |
| API | `apps/backend/src/main.ts` | template catalogue/detail/YAML, per-template runs/evidence/advance; child `/runs/:id` action routes |
| Frontend proxy | `apps/frontend/app/api/[...path]/route.ts` | allowlisted local-only API routes |
| Caller | `apps/frontend/components/automate/pipeline.tsx` → `workflow-plan-editor.tsx` → `template-browser.tsx` | original modal and workflow artboard, retained existing action template workflows |
| Growth UI | `growth-profile-pipelines.tsx` → `growth-workflow-artboard.tsx` | parent connected pipeline nodes, child task nodes, source journal status, red failed node, navigation back |
| Tests | `apps/backend/tests/growth-profile-workflow.test.ts`, `browser.integration.test.ts`, frontend route tests | contract/failure, true browser fixture graph and no implicit launch |

**Error flow:** `Runner` records current step and `stage: failed` with bounded reason. Browser startup failure before first plan task is assigned to `session`. The coordinator's `pipelineRuns` provides the child's state/currentStepId/error. The artboard colors a failed or blocked outer node red and highlights the failed inner node; journal link remains available. **Never infer a failing child task from a generic error without a real ID.**

**Handoff race:** `RunSummary.state='completed'` occurs before async `browser.close()` finishes in Runner `finally`. A coordinator call to `advance` in that interval previously attempted `Runner.start` and could fail `BUSY`. Fix: expose `Runner.isIdle()`; emit `releasePending` in compiled status; `canAdvance` is false while active; `advance` rejects without starting/persisting a new stage; UI explains the cleanup phase. A new stubbed regression test asserts blocked advancement and subsequent success.

## 4. Progress, status and validation evidence

| Date | Item | Status | Evidence |
|---|---|---|---|
| 2026-10-28 | Growth scope and initial profile architecture | IMPLEMENTED, draft | PR #6 + PR #7; NOT merged into `main` |
| 2026-10-28 | YAML catalogue, existing modal, nested parent/child graphs, failure attribution | IMPLEMENTED / CI_VERIFIED for baseline | former PR #9 consolidated into PR #7 at `3a06ddbf18b4b3a1efc12a7fa247ee0dcbab41d3` |
| 2026-10-28 | Full baseline CI | CI_VERIFIED for **exact baseline SHA only** | [Actions #40776273349](https://github.com/surdma/utomator/actions/runs/40776273349) success: backend/unit/Fastify, TS/Biome, builds, hosted security, browser-fixture pipeline edges and task drill-in |
| 2026-10-29 | Async browser cleanup race | INVESTIGATED | Runner completion before `browser.close()` vs coordinator advancement |
| 2026-10-29 | Idle-gated advancement, session-start failure attribution, UI and regression test | IMPLEMENTED at `a640bb4decfe83c3fa5a66b6c24b3d9c7df90047` | Runner `isIdle`, coordinator `releasePending`, new regression test |
| 2026-10-29 | All 21 existing Growth entries discoverable in the same Templates modal | IMPLEMENTED | The 15 capability definitions remain planned/partially supported; 6 real MDX toolkits are discoverable as **guidance only**, with links to their existing Growth-library view and no Runner dispatch. Frontend + browser regression at `3c57bb9ca40ed8a5d9605908eb92d201515fbdb7` |
| 2026-10-29 | Full revised code CI | **CI_VERIFIED** for exact application SHA `3c57bb9ca40ed8a5d9605908eb92d201515fbdb7` | [Actions #40829676014](https://github.com/surdma/utomator/actions/runs/40829676014) completed **success** (all job steps green): backend unit and Fastify, TS/Biome, frontend/backend builds, local SQLite, hosted security, Playwright real-browser fixtures including toolkit selection, nested pipeline graph and no implicit run |
| 2026-10-29 | CI-only validation pull request | CLOSED, **not merged** | [PR #10](https://github.com/surdma/utomator/pull/10) was a draft targeting `main` solely to activate the `pull_request` CI filter; canonical PR #7 remains draft on PR #6 |
| 2026-10-29 | Independent review and live LinkedIn account acceptance | **BLOCKED / NOT VERIFIED** | A green CI run does not prove real LinkedIn permissions, exact 20-field assessment, live UI owner approvals, or an independently reviewed full general-purpose engine |

**Local execution limitation:** no project checkout was mounted, and `git ls-remote https://github.com/surdma/utomator.git HEAD` failed with DNS resolution error in this environment. Do not claim local Node tests. The full GitHub CI result is verified against application SHA `3c57bb9`; this subsequent documentation-only update does not change the tested code. CI fixtures are not live LinkedIn validation.

## 5. Blockers / risks (do not mark resolved without evidence)

| Priority | Blocker | Impact / next owner |
|---|---|---|
| P0 | Real connected LinkedIn owner execution has not been exercised | Integration/Dogfood + consenting owner; safe read-only verified session and evidence before any write |
| P0 | Growth compiler remains LinkedIn-profile-specific; one YAML example | API/Contract + Backend + Security: generic `GrowthWorkflow` schema/version, typed task registry, provider ownership and backward compatibility |
| P0 | Twenty profile sections have no independently verified field-level collector/rubric chain | Backend + Test + Product: scope each collector, explicit unavailable/manual states, source provenance and no fabricated success |
| P1 | Coordinator restart/recovery, multi-process idempotency and active-child reconciliation unverified | Backend/Reliability: recovery state machine, duplicate start protection, tests across restart |
| P1 | Growth parent/child graph currently read-only, not a YAML authoring editor | UI/UX + Frontend + API: versioned graph edit + compile + persist + round-trip; preserve approvals |
| P1 | Six legacy MDX toolkits are discoverable as guidance in the Templates modal but not converted to YAML; additional 14 capability definitions have no supported YAML | Product + Backend: migrations in small, provider-verified increments; planned/guidance is not executable |
| P1 | No live fixture assertion yet for browser-open failure → session task after this change | Test + Integration: simulate actual browser bootstrap failure and check session journal and red parent |
| P2 | Responsive/keyboard/long-running polling, status recovery and journal transitions | Frontend + Dogfood: mobile, keyboard focus, loading/errors, stale child journal, accidental launches |

## 6. Predecessor, successor, exact handoff

**Predecessors:** PR [#6](https://github.com/surdma/utomator/pull/6) (Growth/MDX catalogue) → PR [#7](https://github.com/surdma/utomator/pull/7) (YAML/Runner composition) → former PR #8 and #9 consolidated **into the PR #7 branch**, not main. Temporary [PR #10](https://github.com/surdma/utomator/pull/10) provided the completed full CI gate and was **closed without merging**. Re-check refs on each resumption.

**Current:** Engineering Lead controls `INVESTIGATED → IMPLEMENTED → TEST → REVIEW → DOGFOOD → GIT`. This change's scope is the real Runner cleanup handoff and associated visibility; do not broaden to synthetic full 20-field automation.

**Successor sequence / next actions:**
1. **Test Engineer** — independently run focused state tests, verify completed-but-active rejects advance without launching new child or changing `activeIndex`, confirm subsequent advancement after idle; inspect startup failure evidence.
2. **Independent Reviewer** — challenge Runner status/cleanup race and all `start`/failure/advance call sites; reject idempotency/ownership gaps.
3. **Integration & Dogfood** — exercise Templates → Growth → six parent nodes/five actual SVG paths → child task chain → back; simulate failure, test mobile/keyboard; document real provider boundary separately.
4. **Backend/API/Contract/Security** — define generic type-safe versioned Growth workflow schema for remaining Growths; run a second **different** reviewed, read-only Growth as proof of reuse; retain old documents and APIs.
5. **Git/Release** — only after gates: verify branch/diff, CI by exact head, ancestry PR #6 → PR #7, update this file, do not call `main` merged prematurely.

**On the next resume:** refresh canonical RelvorLabs Engineering Lead, HANDOFF and using-superpowers; fetch current PR #7 head, latest CI and this document. Reconcile source with this ledger, record exact result and successor. If changed, update this *same file*, not a new status note.

## 7. Prohibited assumptions and completion gate

- CI browser fixtures do not prove real LinkedIn access or actual profile writes.
- A red parent border without real `currentStepId`/journal is not sufficient task diagnosis.
- Six read-only audits do not imply that 20 fields were assessed, modified or optimized.
- One YAML sample plus a catalogue does not mean the remaining 20 Growth experiences execute.
- MDX, Research and Editorial cannot be deleted until lossless replacement validated.
- Keep PR #7 **draft** if integration, independent review, real account proof or generic compiler acceptance remains blocked.


## 8. 2026-10-29 continuation: a reusable, bounded Growth YAML contract

**Verified gap:** `compileGrowthProfileYaml` claimed to allow 1–24 pipelines but discarded all coverage assignments on a single final `sections: "*"` stage. The coordinator's reserved `review` name also applied to unrelated Growth IDs.

**Architecture change candidate:** Preserve `GrowthProfileWorkflow` unchanged and also accept `GrowthWorkflow` with the same safe, read-only LinkedIn Runner contract. A one-stage `*` pipeline now covers all its fields. A later final `*` stage only revisits requirements assigned in earlier pipelines, preventing omitted coverage from being silently claimed. The special default profile final review restriction is unchanged.

**Concrete proof:** `apps/backend/growth/branding-workflow.yaml` is a separate YAML *definition*, not a separate React template page. The existing Templates modal and artboard discover it as a one-pipeline read-only positioning baseline, with session authentication and five owner-supplied field records. This is not a full brand strategy, provider editing or measured growth outcome. Template descriptions now reflect each executable YAML's actual objective.

**Validation scope:** Added backend catalogue/contract/owner-evidence tests and a browser-fixture route through the existing Templates modal and task graph. The tests have not yet been executed in a full checkout in this session; the earlier green CI refers only to the previous application SHA.

**Status and predecessor/successor:** INVESTIGATED → PLANNED → implementation candidate prepared. Predecessor: Engineering Lead, Repository Investigator, API & Contract, Backend and Frontend. Successor: Test Engineer (typecheck, backend and browser regression) → Independent Code Reviewer (coverage and trust boundaries) → Integration/Dogfood (real owner read-only run, failure highlight, keyboard/mobile) → Git/Release (exact-head CI, PR ancestry). Keep PR #7 draft until gates pass. Existing P0 blockers for field-level collectors, generic typed provider operations, durable restart reconciliation and unimplemented Growth capabilities remain open.

## 9. Verification result and release hold: 2026-10-29

**Candidate:** validated on isolated branch `verify/pr7-growth-yaml-reuse-20261029` from executable-code SHA `0164b3ce10f1dec754c02aa4f6dd379fd9c12e6d` (not merged into canonical PR #7). This record update is documentation-only.

**Exact CI evidence:** [GitHub Actions run 40837438685](https://github.com/surdma/utomator/actions/runs/40837438685). Passed: frontend route tests; backend unit/Fastify tests including the additional Growth schema and coordinator tests; backend typecheck/lint/build; frontend production build and typecheck; SQLite initialization; hosted gateway checks; lifecycle smoke; real-browser **fixture** integration, all 18 tests passed including `second Growth YAML uses the same modal and nested pipeline graph`. The authenticated live LinkedIn owner workflow was **not** exercised.

**Overall workflow failed:** Final `Frontend connection browser regression tests` step: 10 tests passed, but `apps/frontend/tests/connector-states.test.ts:64` (`Compact LinkedIn dialog stays usable on narrow mobile viewports`) timed out (initial plus two retries) while attempting `openConnectorDialog` at `tests/support/connector-mocks.ts:58`. This failing test belongs to the concurrently updated connector flow and must be independently investigated, not ignored as unrelated or represented as green. Subsequent canonical PR #7 change `025c07bff6eeef80ee31712ea5661033a1a0ec1d` changes the mobile Mator launcher; **no retest is claimed here**.

**Git gate:** CI-only draft PR #11 was **closed unmerged**. Retain this implementation as an isolated review candidate; canonical PR #7 remains draft. Do not promote or report `COMPLETE` until exact integrated head CI passes and required review/dogfood gates are satisfied.

**Predecessors:** Engineering Lead → Repository Investigator → API/Contract/Backend → Frontend → Test Engineer (candidate CI checked). **Next successor:** connector owner/Frontend Test Engineer confirms the mobile dialog fix with a green targeted browser test; Independent Code Reviewer challenges new one-stage coverage semantics; Integration/Dogfood tests failure highlighting, modal accessibility and an authorized read-only session; Git/Release rebases or merges into the latest PR #7 head after gate evidence, checks no collateral connector regression and verifies remote commits. Backlog remains generic versioned user-authored YAML persistence, provider-safe task registry, restart recovery, 20 verified field-level collectors and other Growth executors.
