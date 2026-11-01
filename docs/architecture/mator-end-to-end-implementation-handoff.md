# Mator end-to-end redesign: implementation plan and running evidence ledger

> **Status: M1 IMPLEMENTED + 60/60 CI BROWSER VERIFIED for mock-backed interaction and rendering; M2 VOICE RECOVERY PARTIAL; live backend/Groq dogfood, independent review and CI baseline recovery remain open.** Created 2026-11-01. Branch: `work/mator-e2e-tracked-20261101`, base `main` at `c7b5d42c5b0d34488d81bada181035327ee7cb20`.
>
> This is the Mator-specific implementation and handoff ledger. The Growth YAML project retains its separate canonical progress record in [growth-workflow-implementation-handoff.md](growth-workflow-implementation-handoff.md). When work modifies the Growth compiler/coordinator, update that record as well. An entry below must not claim validation unless there is a command result, diff, test report, or browser evidence.

## 1. Objective and current/proposed boundary

Deliver a text-first, compact, responsive Mator dock with readable content-sized user messages, calmer chat history, voice-only mode switched from the header, user-visible approvals, usable attachments, and **pipeline-first execution status based on real YAML and Runner events**. Integrate Groq's provider-backed model list and persisted model settings, plus owner-scoped CRUD/versioning for the Growth catalogue and YAML. Preserve the existing Growth Library's UI and a single authorized Runner.

**Verified baseline:** The current frontend has message-scroller, questionnaire, model-selector, attachment canvas, confirmation, and per-workflow conversation plumbing. These are not proof that the requested interactions work correctly. The backend model catalogue is static; the completion call fixes temperature at 0.2. User-message rows in `operator-chat-panel.tsx` override `MessageContent` with `flex-0`. `TaskBlock` groups raw run events by run ID with `running={false}` and no stable pipeline/task correlation in the event contract.

**Current Growth baseline:** PR #14 merged 21 YAML template definitions into `main` on 2026-11-01. The architecture ADR [growth-workflow-unification-v2.md](growth-workflow-unification-v2.md) identifies two bounded Runner programs and 19 design-only blueprint definitions. **Catalogue visibility is not provider execution.** Confirm the current compiler output against code and tests before migration.

**Proposed, not yet implemented:** A shared canonical workflow, durable correlated run task journal, Groq live discovery/pricing/account availability, versioned database-managed Growth definitions, and any field-level LinkedIn optimization beyond registered Runner operations.

### Source-of-truth hierarchy

- Repository invariants: `AGENTS.md`, [docs/README.md](../README.md).
- Existing Mator design: [2026-10-31 dock spec](../superpowers/specs/2026-10-31-mator-dock-redesign-design.md), [action chat spec](../superpowers/specs/2026-10-30-mator-action-chat-design.md), and [action chat plan](../superpowers/plans/2026-10-30-mator-action-chat.md).
- Architecture: [Growth unification v2](growth-workflow-unification-v2.md), [unified engine](unified-growth-workflow-engine.md), [YAML migration](yaml-engine-migration.md), and [Growth composition](growth-profile-composition.md).
- Method/evidence principles: [Growth/Craft methodology](../knowledge/growth-craft-methodology.md).
- Reinspect real code before every edit; older documentation may refer to removed `components/automate` paths.

## 2. Work graph, ownership, and status

| ID | Deliverable and acceptance | Owner / next reviewer | Current state |
| --- | --- | --- | --- |
| M0 | Baseline, dependency map, validated plan, PR/ledger | Engineering Lead + Investigator; Git/Release | **ESTABLISHED**; draft PR #15 and persistent handoff live |
| M1 | Every user and assistant bubble content-visible, selectable, intrinsic widths, capped cards, no mobile horizontal scroll | UI/UX → Frontend → Test → Reviewer | **IMPLEMENTED + CI BROWSER VERIFIED**, including message send/retry/reload and latest order: 60/60 Playwright tests on code `ee71feaf` in [run 41289247679](https://github.com/surdma/utomator/actions/runs/41289247679). Mock-backed UI only; independent review, live API/DB dogfood pending |
| M2 | Header voice-only switch (icon, accessible name, shared persisted store); compact composer, history, focus, accessibility, attachments/errors | UI/UX → Frontend → Test → Reviewer | **PARTIALLY IMPLEMENTED**: shared header voice preference, MediaRecorder fallback, voice input→Mator send, spoken assistant reply, MIME-safe STT filenames; browser-mocked tests pass. Live audio/provider and remaining interaction polish not verified |
| M3 | YAML stage/pipeline → registered child Runner plan → stable task IDs → true event/status/evidence correlation in chat | Investigator → API/Contract → Backend → Frontend → Test → Reviewer → Dogfood | PLANNED; missing contract is blocking |
| M4 | Authenticated Groq Models List, supported model metadata, persisted default and temperature, real completion payload propagation, safe failure handling | API/Contract → Backend → Frontend → Test → Reviewer | PLANNED; pricing/free access must not be guessed |
| M5 | Versioned, tenant-scoped, CRUD-capable Growth definitions and validated YAML in database, preserve old catalogue UI and executable/design-only distinctions | DB/Drizzle → Backend → API/Contract → Frontend → Test → Reviewer → Dogfood | PLANNED; investigate library GET error first |
| M6 | Initial Profile Optimization selected from validated workflow, never silently run, never rename audit as completed optimization | Frontend → Backend if contract needed → Test | PLANNED |
| M7 | End-to-end browser verification, security, regression, responsive and accessibility review, Git release gate | Test → Independent Reviewer → Dogfood → Git/Release | BLOCKED pending implementation/runtime |

**Implementation stages** use `INVESTIGATED → PLANNED → IMPLEMENTED → LOCALLY_VALIDATED → REVIEWED → INTEGRATION_VERIFIED → COMMIT_READY → COMMITTED → PUSHED → CI_VERIFIED → COMPLETE`. PR **draft** is not an implementation stage. Each stage requires evidence; a failed gate returns to its owner.

## 3. Verified execution paths and risky boundaries

- Dock: `apps/frontend/components/dashboard/dashboard-shell.tsx` → `operator-chat-panel.tsx` → `Message`/`MessageContent`/`Bubble`; Mator events originate in `use-mator-chat.ts` through `mator-api.ts`, local Next API proxy, and `mator-routes.ts`/document storage. Both persisted and legacy user rendering paths must be covered.
- Voice: `mator-composer.tsx` currently owns a `localStorage` preference. Do not introduce separate unsynchronized header and composer stores. The text composer remains primary by default.
- Runs: `use-run-monitor.ts` and `run-models.ts` consume events. `runner.ts` and `profile-growth-coordinator.ts` determine *observed* events and stage advancement. A completed summary can precede browser close; the next child cannot advance before Runner is idle. YAML task names are not execution receipts.
- Groq: `mator-models.ts`, `mator-settings.ts`, `mator-groq.ts`, `mator-routes.ts` and frontend `mator-api.ts`/`mator-chat-settings.tsx`. Secrets stay server-side. A frontend slider without persistence, validation and request wiring is forbidden.
- Growth: `growth/*.yaml` → `growth-profile.ts` → `profile-growth-coordinator.ts` → `/growth/templates` → Next allowlist proxy → `template-browser.tsx`, `growth-workflow-artboard.tsx`, and Growth Library UI. Read-only design blueprints cannot be presented as executable. Preserve existing consumer response shapes or perform explicit versioned migration.
- Storage: `apps/backend/src/db/documents.ts` already implements owner-scoped, CAS-protected documents over dual SQLite/PostgreSQL dialects. Evaluate a normalized relational schema versus owner-scoped document versions before choosing migrations. If new schema is necessary, update **both** Drizzle dialects and forward migrations; keep immutable released run snapshots.
- Default: `default-workflow-plan.ts` is a valid audit `WorkflowPlan`; `use-workflow-workspace.ts` bootstraps/loads saved workflows. Do not overwrite existing selections or mislabel audit.

## 4. Contract-first implementation order and acceptance

### M1: Chat geometry and message text
First reproduce with short text, multiline text, very long unbroken text, persisted voice transcript, and attachments. Then patch both user rendering paths, the shared content sizing contract, assistant message caps, confirmation cards, clarification prompts, screenshots and review cards. Run targeted DOM/browser tests for text visibility, actual client width, overflow, keyboard selection, and responsive 375/768/1024/1440 widths. Existing screenshot annotation links and approval controls must remain wired.

### M2: Dock interaction
Extract one voice-only external store with both header and composer consumers; remove in-composer switch, retain text mic; maintain a small labelled toggle and keyboard focus. Keep active workflow thread popover, new chat, restore, history timestamps and empty/loading/error states. Check persisted mode after reload; verify no auto-send or duplicate turns, cancellation and upload failures restore user work.

### M3: Pipeline and task journaling
Define and test an additive event projection referencing `workflowId`, pinned `sourceVersion`, `pipelineId`, `taskId`, `runId`, event type/time, status and evidence ID. Derive from actual compiler/coordinator/Runner metadata; never infer a running state from mere YAML presence. Show queued/running/approval/blocked/failure/completed only from observed state; distinguish owner-review-required tasks. Render a compact collapsible pipeline with nested task history and evidence; correlate real browser screenshot to exact task.

### M4: Groq integration
Use server-side authenticated model discovery, account/capability gating and a bounded cache; handle missing API key, rate limit and provider errors explicitly. A free API quota is not the same as a zero-cost model. Default model selection survives restart. Make temperature a validated owner setting and pass to Groq only when the selected model supports it, keeping reasoning effort separate. Test provider request bodies and failure states with controlled responses, then a real account where available.

### M5: Growth persistence
First reproduce `GET /growth/templates` success/failure via Fastify, Next proxy and consumer; an error toast does not prove a storage problem. Inventory 21 YAML definitions and existing MDX/Craft records, stable IDs, ownership, version hashes and execution capabilities. Design additive persistent definition/revision records, idempotent seed and optimistic concurrency. Validate YAML on every mutation; support authorized create/edit-draft/duplicate/lock/publish/archive/read and safe recovery. Preserve the Growth Library layout exactly. Test restart, owner isolation, locking, duplicate, stale writes, invalid YAML, immutable published revision, migrations on both dialects and unchanged Runner authorization.

### M6: Profile optimization default
For *new* workspaces choose the validated Profile Optimization template with its honest run/manual readiness; keep the previous audit action available and existing saved workflows unchanged. Template selection must not launch the browser or auto-approve an action.

## 5. Test-driven and independent quality gates

| Gate | Evidence required | Verified result as of 2026-11-01 |
| --- | --- | --- |
| Unit/regression | Node `--test` behavior coverage, registered in explicit package test list | CI passed frontend 87 and backend 165 unit/Fastify tests in run `41286625838`; new M1 browser test added to existing Playwright suite (not Node test list) |
| Frontend checks | `pnpm --filter @utomator/frontend test`, `typecheck`, `lint`, `build` | CI frontend test, production build and `tsc --noEmit` passed; repo-wide Prettier gate failed on the **same 10 files** already unformatted on `main` (run `41281517238`), so ESLint step was skipped |
| Backend checks | `pnpm --filter @utomator/backend test`, `typecheck`, `build`; Biome format/lint | CI backend unit tests, typecheck/build and hosted tests passed. Biome formatter failed on **14 pre-existing format violations in untouched backend files**; lint skipped |
| DB/contract | SQLite + Postgres migration/status, API round-trip, negative auth/isolation cases | NOT RUN |
| Browser | Production Next and Playwright responsive/a11y quality suite, short/long user content, assistant Markdown and long staged approval | **PASS: 60/60 Playwright tests** on repaired M1 + partial M2 source `ee71feaf` in [run 41289247679](https://github.com/surdma/utomator/actions/runs/41289247679). Tests passed in desktop/tablet/mobile Chromium and iPhone WebKit; includes typing and sending, failed draft retention, retry, reload, latest reply placement, MediaRecorder-only capture, voice-only assistant playback and MP4/M4A upload metadata. [Screenshots/report artifact](https://github.com/surdma/utomator/actions/runs/41289247679). These tests mock Mator API calls; not live Groq/DB proof |
| Integration | Real message→API→store→render; YAML task→Runner events→pipeline UI; Groq selection→completion; Growth CRUD→reload | NOT VERIFIED; existing Runner/Next fixture integration has **17/19 pass and 2 known baseline failures** (same two test names in `main` run `41281517270` and branch run `41286625838`). M3-M6 paths not implemented |
| Reviewer | Independent issue-focused diff and call-site/consumer review | Complete PR diff and relevant caller/consumer source inspected during implementation; **independent verdict not obtained** |
| Dogfood | Real user workflow plus failure paths, screenshots and reproducible evidence | NOT STARTED |
| Git/CI | Source committed on isolated draft PR branch using GitHub connector and tested in Actions; no merge until further gates | Branch commits and diff independently verified via GitHub; draft [PR #15](https://github.com/surdma/utomator/pull/15) remains NOT MERGE READY because pre-existing CI checks fail and independent dogfood/review incomplete |

**TDD rule:** For each change, document failing baseline test or reproducible defect, implementation diff, passing focused test, broadened regression results, and independent verdict. Source-text matches alone do not prove that the browser works. Do not downgrade E2E claims to mocked API tests.

## 6. Environment limits and prohibited claims

At initial creation time the connected private repository could be read through GitHub but `git ls-remote https://github.com/surdma/utomator.git HEAD` failed in the executable container with `Could not resolve host: github.com`. The environment had Node and Git but no usable private checkout, pnpm workspace install, running Next/Fastify app, or browser session. The earlier geometry patch was checked against actual source and an adapted M1 fix plus Playwright regression were committed directly to the draft PR branch on 2026-11-01. Local clone is still unavailable. GitHub Actions tested the production Next build and browser interactions; after the M1 delivery and M2 voice-recovery changes, the frontend quality suite **passed 60/60 in all configured projects** on code `ee71feaf` (run `41289247679`). The backend integration job still fails its **two previously failing fixtures**, identical in main and branch. Repository-wide Prettier, Biome and React Doctor also fail from pre-existing baseline debt. This is browser-level UI validation with mocked API responses, **not complete live backend-to-frontend or provider dogfood**. PR #15 must stay draft until remaining gates are resolved.

Never invent a successful LinkedIn edit, Groq availability, observed pipeline task, rate tier, model price, screenshot, migration, test result or commit. Do not commit unfinished production logic to obtain a PR diff.

## 7. Running progress and persona handoff

| Date | Action | Status/evidence | Next owner |
| --- | --- | --- | --- |
| 2026-11-01 | Refreshed Lead, HANDOFF, using-superpowers, create-pr; inspected `main` and relevant Mator/Growth/contracts/docs; compared prior handoff | INVESTIGATED/PLANNED, main `c7b5d42`; no production code modified | Git/Release for draft documentation PR; then Frontend (M1) |
| 2026-11-01 | Created branch `work/mator-e2e-tracked-20261101` at base SHA | Branch creation confirmed; PR #15 opened as draft | Git/Release |
| 2026-11-01 | M1 Playwright browser regression committed | `apps/frontend/tests/frontend-quality.test.ts`, commit `8fd9ff9`; mocked server-side persisted messages, narrow viewport geometries, assistant and staged cards, screenshots | Frontend |
| 2026-11-01 | M1 UI source fix committed | `apps/frontend/components/dashboard/pipeline/operator-chat-panel.tsx`, commit `e340c95`; two user message paths and contextual cards, reviewed as source diff | Test → Reviewer → Dogfood |
| 2026-11-01 | M1 long-text regression strengthened | `apps/frontend/tests/frontend-quality.test.ts`, commit `76ad0e0`; asserts long assistant paragraph and long approval have no scroll overflow | Test |
| 2026-11-01 | M1 long-text fixes committed | `operator-chat-panel.tsx` `5ab7740` and `ai-elements/confirmation.tsx` `768f27e`; add arbitrary-word breaks without changing action APIs | Browser QA |
| 2026-11-01 | Verified production browser QA | [GitHub Actions run 41286625838](https://github.com/surdma/utomator/actions/runs/41286625838), **50/50 Playwright tests**, M1 across desktop/tablet/compact/landscape Chromium and WebKit; [screenshot/report artifact 13075133882](https://github.com/surdma/utomator/actions/runs/41286625838/artifacts/13075133882) | Independent Reviewer → Dogfood |
| 2026-11-01 | CI baseline comparison | Code quality run `41286625777` fails Prettier 10 pre-existing frontend files, Biome 14 untouched backend errors, React Doctor pre-existing state updater errors in voice/workflow hooks. Existing main `41281517238` failed frontend+backend formatting. Backend browser fixture: 17 pass/2 fail, identical to `main` [41281517270](https://github.com/surdma/utomator/actions/runs/41281517270) | Reviewer, CI-maintenance owner separately |
| 2026-11-01 | M1 input and ordering repair | Commits `38a5247`, `b75dcc2`, `0ae957e`: newest Mator message at bottom/anchored; run and review artifacts before thread; typed text routes to persistent Mator, API failures preserve draft and report error | Test → Reviewer |
| 2026-11-01 | M2 voice capture and toggle | Commits `0f45226`, `3cb999f`, `c71a28a`, `f9bdff3`: shared `mator.voiceOnly` header switch; text-first default; MediaRecorder supported without SpeechRecognition; storage fallback | Test → Reviewer |
| 2026-11-01 | M2 two-way voice and audio format | Commits `6c48b32`, `cbcceb1`, `6c1650f`, `2c6cd4`: voice-only assistant answers spoken once; sent transcript cleared on success; MP4→M4A filename and provider STT errors surfaced | Test → Reviewer → Dogfood |
| 2026-11-01 | M1+M2 browser interactions verified | Test commits `51cb9be`, `968577b`, `ee71fea`; [Actions run 41289247679](https://github.com/surdma/utomator/actions/runs/41289247679) 60/60 desktop/tablet/mobile Chromium and WebKit tests pass, including mocked Mator send/retry/reload and voice input→assistant voice output | Independent Reviewer → Dogfood |
| 2026-11-01 | CI baseline remains red | Backend browser fixture 17/19 pass, same failures as `main`: validated Next workspace and Growth graphs; repo-wide format and React Doctor remain red. Mator production build and frontend browser quality pass; **no live Groq/DB dogfood** | CI-maintenance + Integration |


### Next handoff: Independent Reviewer / Integration & Dogfood for M1+partial M2; then Frontend and API Contract

**Objective:** Prove or disprove the actual user's failures: text input must submit, failed text must stay editable, latest messages must appear after older workflow evidence, and voice-only must support microphone input and spoken assistant output across browsers.

**Current status:** IMPLEMENTED, COMMITTED, PUSHED, CI BROWSER VERIFIED (mock Mator APIs); **not** independently reviewed or fully integrated. Source is at `ee71feafcb617976f57307deb18ee5eb1f84f333` immediately before this documentation update.

**Files changed:** `dashboard-shell.tsx`, `pipeline/{operator-chat-panel,mator-composer,mator-voice-preference,use-voice-session,use-mator-chat,mator-api}.tsx|.ts`, `tests/{frontend-quality.test.ts,mator-chat-ui.test.mjs}`, earlier `ai-elements/confirmation.tsx`.

**Verified calls:** DashboardShell → MatorComposer controlled textarea or voice onFinal → `useMatorChat.send` → `postMatorMessage` → Next allowlisted proxy → Fastify `mator-routes` → `runMatorTurn` → stored events. For voice, `MediaRecorder` → `transcribeMatorAudio` → API → Mator send; voice-only assistant `kind='message'` → `voice.speak` → `synthesizeMatorSpeech` (browser TTS fallback). The two-way path was **mocked in browser tests**; live provider account behavior is not proven.

**Commands actually executed:** GitHub Actions run `41289247679`: frontend production Next build, TypeScript, 60 Playwright responsive/a11y tests **pass** on source `ee71feaf`; backend unit/Fastify and hosted suites passed; existing backend fixture job still 17 pass/2 fail. Codequality workflow still fails on existing repo-wide formatter and React Doctor debt. Direct local Git clone remains DNS-blocked.

**Risks and acceptance still open:** Real Groq key absent may cause HTTP error rather than a response. The UI now displays that error and restores the draft, not a fake answer. Reproduce with real Fastify + configured document store/Groq account: send and reload in current workflow; switch history across conversations; record audio on Chrome, Safari and mobile devices; confirm remote TTS and user mute; inspect full conversation and attachments; assess keyboard/screen-reader interactions; obtain independent reviewer and dogfood verdict. Do not assert voice/live backend 10/10 until those checks pass.

**Next owner:** Independent Reviewer and Dogfood (unverified real paths). Any failure routes to Frontend + API Contract/Backend. M3 correlation and M4–M6 remain planned in this ledger and must not be labelled implemented.

### Progress record template for subsequent entries

For each M-ID append: date; owner; verified baseline/root cause; exact files and contracts; red test/repro; diff/commit SHA if any; green local command outputs; review verdict; dogfood evidence; blockers; next persona. Update this file and, when touching Growth runtime, the canonical Growth YAML handoff. Update PR body/checklists to match verified results.
