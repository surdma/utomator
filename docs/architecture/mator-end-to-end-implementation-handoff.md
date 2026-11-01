# Mator end-to-end redesign: implementation plan and running evidence ledger

> **Status (2026-11-01): M1/M2 source implemented on draft PR #15, with targeted correctness and layout corrections; NOT COMPLETE. Earlier M1 browser validation was 70/70. The first newly introduced strict gap test reproduced 302–480px of trailing whitespace (68/70 on `cae2420`). User/assistant anchor removal and clarification regression tests are now under current CI verification. Real Groq/microphone/linked-account dogfood, independent review and repository-wide code-quality recovery remain outstanding.** Created 2026-11-01. Branch: `work/mator-e2e-tracked-20261101`, base `main` at `c7b5d42c5b0d34488d81bada181035327ee7cb20`.
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
| M1 | Chat messages visible, correctly ordered, entered and retried; voice transcripts sent; staged proposal confirmations bind to exact event, with correct resolution history and no duplicate decisions | UI/UX → Frontend → Backend → Test → Reviewer | **IMPLEMENTED + CI BROWSER VERIFIED**: 70/70 Playwright tests on code `d95ecaa0` in [run 41292959721](https://github.com/surdma/utomator/actions/runs/41292959721), including 10 stage decisions tests across desktop/tablet/mobile/WebKit and first-run creation; backend unit/route 89/89, 166/166; *mock/provider boundaries unverified*, independent review pending |
| M2 | Composer voice-only Switch; chat settings, compact composer, history, focus, accessible clarification upload/URL, opt-in pencil annotation, Groq STT/TTS, real Runner status voice | UI/UX → Frontend + API → Test → Reviewer/Dogfood | **IMPLEMENTED IN DRAFT** (`e09dc2d` through `e980fb6`); focused source and unit coverage added, earlier M2b pure helper 8/8 passed; latest full Playwright/CI and live provider/microphone dogfood remain unverified, so M2 NOT COMPLETE |
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
| Browser | Production Next and Playwright responsive/a11y quality suite, short/long user content, assistant Markdown and long staged approval | **PASS: 70/70 Playwright tests** on M1 + partial M2 source `d95ecaa0` in [run 41292959721](https://github.com/surdma/utomator/actions/runs/41292959721). Tests passed in desktop/tablet/mobile Chromium and iPhone WebKit; includes typing and sending, failed draft retention, retry, reload, latest reply placement, MediaRecorder-only capture, voice-only assistant playback and MP4/M4A upload metadata. [Screenshots/report artifact](https://github.com/surdma/utomator/actions/runs/41292959721/artifacts/13078031443). These tests mock Mator API calls; not live Groq/DB proof |
| Integration | Real message→API→store→render; YAML task→Runner events→pipeline UI; Groq selection→completion; Growth CRUD→reload | NOT VERIFIED; existing Runner/Next fixture integration has **17/19 pass and 2 known baseline failures** (same two test names in `main` run `41281517270` and branch run `41286625838`). M3-M6 paths not implemented |
| Reviewer | Independent issue-focused diff and call-site/consumer review | Complete PR diff and relevant caller/consumer source inspected during implementation; **independent verdict not obtained** |
| Dogfood | Real user workflow plus failure paths, screenshots and reproducible evidence | NOT STARTED |
| Git/CI | Source committed on isolated draft PR branch using GitHub connector and tested in Actions; no merge until further gates | Branch commits and diff independently verified via GitHub; draft [PR #15](https://github.com/surdma/utomator/pull/15) remains NOT MERGE READY because pre-existing CI checks fail and independent dogfood/review incomplete |

**TDD rule:** For each change, document failing baseline test or reproducible defect, implementation diff, passing focused test, broadened regression results, and independent verdict. Source-text matches alone do not prove that the browser works. Do not downgrade E2E claims to mocked API tests.

## 6. Environment limits and prohibited claims

At initial creation time the connected private repository could be read through GitHub but `git ls-remote https://github.com/surdma/utomator.git HEAD` failed in the executable container with `Could not resolve host: github.com`. The environment had Node and Git but no usable private checkout, pnpm workspace install, running Next/Fastify app, or browser session. The earlier geometry patch was checked against actual source and an adapted M1 fix plus Playwright regression were committed directly to the draft PR branch on 2026-11-01. Local clone is still unavailable. GitHub Actions tested the production Next build and browser interactions; after the M1 delivery and M2 voice-recovery changes, the frontend quality suite **passed 60/60 in all configured projects** on code `ee71feaf` (run `41289247679`). The backend integration job still fails its **two previously failing fixtures**, identical in main and branch. Repository-wide Prettier, Biome and React Doctor also fail from pre-existing baseline debt. This is browser-level UI validation with mocked API responses, **not complete live backend-to-frontend or provider dogfood**. PR #15 must stay draft until remaining gates are resolved.

Never invent a successful LinkedIn edit, Groq availability, observed pipeline task, rate tier, model price, screenshot, migration, test result or commit. Do not commit unfinished production logic to obtain a PR diff.

## 6a. M2 revised voice requirements and API links (2026-11-01)

**Latest user decision overrides the older M2 header placement:** keep the voice-only switch **inside the composer**, and put the existing chat settings popover there as well. Do not implement a second independent voice preference or settings store. Control rows must not wrap/overflow and must be accessible at mobile widths. The current PR already has partial M1/M2 production edits; **do not describe it as documentation-only**. A full M2 contract and permanent source reference registry are at [M2 voice/accessibility/API references](mator-m2-voice-accessibility-references.md), including all requested shadcn, AI Elements and Groq URLs. Existing Groq STT and TTS are wired but require provider-limit and fallback validation; do not rebuild them blindly.

**M2a application (commit `e09dc2d`):** The source change is now applied on this draft branch. The voice-only Switch and MatorChatSettings are in both composer decks (not the header). The main composer action row uses nowrap, and guidance/error cards have compact width rules. Source and Playwright tests were updated. Full live voice/device dogfood is still pending.

**M2b–M2g implemented in draft source, not release-verified:** `478c970` segments Orpheus TTS into max190-character requests and supports serialized playback/browser fallback; `56b782d` defers annotation until pencil activation; `542036d` validates typed URL/file clarifications and uploads files without premature separate messages; `7f70716` deduplicates real Runner SSE event speech and omits sensitive failure details; `ca8c973` synchronizes settings with active chat state; `e980fb6` prevents the compact composer from displaying a too-wide model label. End-to-end accessibility, real Groq and microphone dogfood, independent review, and full CI remain gated. See the M2 reference architecture for details.

### M2 resume checkpoint: Groq text versus voice (2026-11-01)

- **Verified direction:** Current audio input is already sent via `MediaRecorder → /mator/audio/transcriptions → Groq Whisper → plain-text Mator chat`. Converting incoming audio to text earlier using browser speech recognition is a potential accessibility/fallback option, but it does not fix outgoing Orpheus TTS input limits. The separate `/mator/audio/speech` endpoint takes **text** and synthesizes audio.
- **Published provider limit:** [Groq Orpheus English](https://console.groq.com/docs/text-to-speech/orpheus) caps its text input at **200 characters per speech request**. The existing backend endpoint permits up to 4,000 and delegates unchanged, so long replies can trigger provider 400s. Client-side segmented calls of at most 190 characters with serial playback and a server-side bounded validation defense should precede claims of TTS stability. The full text response must never be truncated merely for TTS.
- **Committed M2 continuation:** Speech chunking, sequential playback, cancellation, native fallback and type-safe upload-only clarification paths now exist in the PR's application source. The earlier isolated TTS helper had 8/8 local Node tests and strict TypeScript validation. On later source commit `ca8c973`, GitHub Actions passed frontend production build, backend unit/Fastify tests, backend TypeScript and Biome task, compiled Utomator, frontend TypeScript, and hosted auth/worker checks. As of this ledger update, responsive/a11y Playwright, full integration, and current latest head were not fully verified; preserve their actual check status rather than inheriting success.
- **Remaining release gates:** GitHub full integration/Playwright, independent reviewer and real hardware/Groq dogfood are still required; provider quotas, microphone permissions, focus restoration, and mobile 320px composer widths need user-path verification. Code-quality workflow remains red on repository-wide formatting and React Doctor findings, some demonstrably inherited. M2 is **IMPLEMENTED in draft** but not REVIEWED, INTEGRATION_VERIFIED or COMPLETE. Do not merge.

### M2 source commit trail and next validation handoff (2026-11-01)

**Source commits (all visible in draft PR #15):** `e09dc2d` composer switch/settings; `478c970` Groq bounded audio and STT fallback; `56b782d` deferred pencil annotations; `542036d` typed URL/file clarifications with one-send attachments; `7f70716` real Runner SSE speech with safe summary and dedupe; `ca8c973` settings-to-chat state sync; `e980fb6` narrow-dock model picker. The app's existing authenticated server endpoints, actual persisted model settings, and Runner are reused rather than simulated.

**Independent verification recorded:** At head `ca8c973`, GitHub Actions job `41299755268` passed frontend production Next build, backend unit/Fastify tests, TypeScript/Biome script, hosted auth/worker checks and frontend TS typecheck (job later might report additional failures; inspect its final conclusion). Latest-head workflow after `e980fb6` must be checked independently. Code-quality workflow's frontend Prettier, backend Biome formatting and React Doctor jobs have failed on the branch and predate M2a in part; do not conflate them with a successful release. Mic hardware and real Groq credentials are not exercised by API mocks.

**Next persona:** Independent Test Engineer should read final CI job logs and run responsive 320/375/768/1024px + zoom/axe, questionnaire upload-only idempotency and STT/TTS failure tests. Independent Reviewer must inspect component/contract safety, then Dogfood must exercise a real approved workflow and microphone with account credentials. Git/Release must keep PR in draft until gates pass.

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

**Current status:** IMPLEMENTED, COMMITTED, PUSHED, CI BROWSER VERIFIED (mock Mator APIs); **not** independently reviewed or fully integrated. Source implementation is at `d95ecaa0ced7aa63780d0e429149774d6248a78e` immediately before this documentation update.

**Files changed:** `dashboard-shell.tsx`, `pipeline/{operator-chat-panel,mator-composer,mator-voice-preference,use-voice-session,use-mator-chat,mator-api}.tsx|.ts`, `tests/{frontend-quality.test.ts,mator-chat-ui.test.mjs}`, earlier `ai-elements/confirmation.tsx`.

**Verified calls:** DashboardShell → MatorComposer controlled textarea or voice onFinal → `useMatorChat.send` → `postMatorMessage` → Next allowlisted proxy → Fastify `mator-routes` → `runMatorTurn` → stored events. For voice, `MediaRecorder` → `transcribeMatorAudio` → API → Mator send; voice-only assistant `kind='message'` → `voice.speak` → `synthesizeMatorSpeech` (browser TTS fallback). The two-way path was **mocked in browser tests**; live provider account behavior is not proven.

**Commands actually executed:** GitHub Actions run `41292959721`: frontend production Next build, `tsc --noEmit`, 70/70 Playwright responsive/a11y tests **pass** on source `d95ecaa0`; backend unit/Fastify 89/89 + 166/166, hosted 6/6 pass; existing backend fixture job still 17 pass/2 fail. Codequality workflow still fails on existing repo-wide formatter and React Doctor debt. Direct local Git clone remains DNS-blocked.

**Risks and acceptance still open:** Real Groq key absent may cause HTTP error rather than a response. The UI now displays that error and restores the draft, not a fake answer. Reproduce with real Fastify + configured document store/Groq account: send and reload in current workflow; switch history across conversations; record audio on Chrome, Safari and mobile devices; confirm remote TTS and user mute; inspect full conversation and attachments; assess keyboard/screen-reader interactions; obtain independent reviewer and dogfood verdict. Do not assert voice/live backend 10/10 until those checks pass.

**Next owner:** Independent Reviewer and Dogfood (unverified real paths). Any failure routes to Frontend + API Contract/Backend. M3 correlation and M4–M6 remain planned in this ledger and must not be labelled implemented.


### M1 resumption checkpoint: stage-bound decisions, reliable bootstrap and voice/chat regression

**Status:** IMPLEMENTED, COMMITTED/PUSHED, CI BROWSER VERIFIED for mocked provider and browser interactions. Live production provider, linked-account/database dogfood and independent review are **not** COMPLETE.

**Verified defect sources and corrections**

- `operator-chat-panel.tsx` formerly bound *every* approval card to a single no-argument `confirmStage()` call, which always chose the latest staged action. `dashboard-shell.tsx` and `use-mator-chat.ts` now pass the selected card's `event.id` and reject already-resolved local cards.
- `mator-conversations.ts` now represents `resolvesEventId`; `mator-actions.ts` adds this association to applied events, and `mator-routes.ts` adds it to rejected events and returns HTTP 409 for repeated decisions. `mator-chat-state.ts` derives each staged card status from exact resolution; legacy unlinked histories resolve at most the most recently staged proposal.
- `use-workflow-workspace.ts` replaced an effectively permanent module flag with a shared in-flight bootstrap promise that clears on settlement, making default-workflow initialization recoverable after a transient failure or Strict Mode remount.
- The existing text/voice send fixes remain intact: MediaRecorder support, shared header voice preference, real STT API and chat message API, draft retention, event ordering, and voice-mode assistant speech; these were additionally exercised across browser configurations.

**Specific commit trail:** `ad5d8d9` → `c96f8be` → `5c57323` (backend stage events/routes); `fbd1256` → `c2eeb6c` (frontend stage state/hooks); `a471f64` → `4e34a59` (per-card UI and dashboard handlers); `0d514b6` → `cf545e7` → `1891e2f` (independent approval tests); `6ab7ea3` → `c14f631` (reliable first-run bootstrap/test); `55fd73a` and `d95ecaa` fix actual build/TypeScript findings discovered by CI. The latter is the validated source head before this ledger entry.

**Executed GitHub Actions evidence:** [run 41292959721](https://github.com/surdma/utomator/actions/runs/41292959721) on `d95ecaa0`: frontend production Next.js build **PASS**, frontend explicit TypeScript **PASS**, backend build and unit/routes **PASS** (89/89, 166/166, 6/6), responsive/keyboard/accessibility Playwright **70/70 PASS**, across desktop, tablet, small mobile, landscape Chromium and WebKit. [Browser screenshots and test evidence](https://github.com/surdma/utomator/actions/runs/41292959721/artifacts/13078031443). The broad integration fixture has **17/19**, with the same two known failures present on `main`: `Next.js workspace uses validated forms and blocks unverified execution`, `Growth workspace connects 21 capability and toolkit graphs`. [Code-quality run 41292959716](https://github.com/surdma/utomator/actions/runs/41292959716) remains red on repo-wide existing formatting and React Doctor debt. No test that touched a real external Groq account or linked LinkedIn profile was run.

**Test Engineer verdict:** All 70 focused Playwright cases and new staged-action unit/Fastify assertions passed. **Independent Reviewer verdict:** PENDING; no third-party review or live provider dogfood. **Git/Release gate:** PR #15 must remain draft and unmerged until the outstanding relevant gates are satisfied. **Next owner:** Independent Reviewer → Integration/Dogfood; then Frontend/Backend for any observed regressions. M3–M6 are explicitly outside this M1 completion claim.

### Progress record template for subsequent entries

For each M-ID append: date; owner; verified baseline/root cause; exact files and contracts; red test/repro; diff/commit SHA if any; green local command outputs; review verdict; dogfood evidence; blockers; next persona. Update this file and, when touching Growth runtime, the canonical Growth YAML handoff. Update PR body/checklists to match verified results.

## M1/M2 correction pass and independent test handoff (2026-11-01)

**Owner route:** Engineering Lead → Repository Investigator → Backend/Frontend/UI-UX → independent Node/Fastify and browser Test Engineer → independent Reviewer/Dogfood → Git/Release. The last two gates remain open. This ledger preserves repository and CI evidence, not an assertion that final user/device acceptance has passed.

**Confirmed root causes and production changes on the draft branch:**

- In `mator-agent.ts`, the old generic `persistAction` path staged even `noop` and `explain_how` as mutations; with auto-approval this produced meaningless `applied` receipts. `noop` now creates no action receipt, `explain_how` becomes an ordinary `how` message, and an empty assistant answer is disclosed as no action taken. The three-action cap remains enforced; the hardening test now proves the first three informational responses and no stage/applied actions.
- In `mator-chat-state.ts` and `operator-chat-panel.tsx`, linked and legacy unlinked applied/rejected terminal events are projected onto their originating proposal cards exactly once. Legacy no-op events disappear from visual action cards but stay stored. Old staged explanations show guidance instead of being pending mutation. A terminal event without a matching staged record stays visible for audit rather than being silently lost.
- `mator-composer.tsx` no longer duplicates the staged approval controls. The actual proposal card still binds its exact event ID; `dashboard-shell.tsx` requires an explicit ID to confirm or reject a persisted Mator stage.
- Saved review and run screenshot assets now have bounded intrinsic dimensions; attachments have small clickable thumbnails and original-file links, with the annotation canvas opened only by pencil.
- The shadcn message scroller was tested with a strict <=48 CSS px final-card gap. CI at `cae2420` measured 302px desktop and 480px tablet, confirming the defect. Investigation of the shadcn message-scroller contract identified that `scrollAnchor` intentionally places a new anchored turn near the viewport **top**. Mator had incorrectly anchored its **last assistant event**. The source now uses end-positioned scroller and no last-reply anchors; the independent browser suite must retain the geometric assertion to verify the actual gap.
- M2 composer mode/settings, Groq bounded speech requests and fallback, event-grounded voice status, upload-only file/URL clarification, and deferred annotation remain wired. New browser tests cover safe URL protocols and single-file upload/retry without an unsolicited send. The first URL test passed in the prior browser run; the file error/response path has been corrected in the test to assert the actual safe questionnaire error and separate backend error banner.

**Evidence as checked (not all at the current head):**

- Initial M1 mock-backed production Next/Playwright [41292959721](https://github.com/surdma/utomator/actions/runs/41292959721): 70/70 across desktop/tablet/phone/landscape and WebKit.
- M1/M2 [41304564084](https://github.com/surdma/utomator/actions/runs/41304564084): backend unit/routes, typecheck, Next build and hosted authentication checks passed. New strict scroller regression failed on desktop/tablet (68/70 browser). Existing unrelated broad browser integration remained 17/19 (two pre-existing Growth/workspace fixture failures also observed on main).
- On subsequent in-progress [41305484474](https://github.com/surdma/utomator/actions/runs/41305484474), recorded logs showed final-card gap **passed** on desktop/tablet, while the new URL test passed and initial clarification file-retry assertion failed because it incorrectly expected the backend 503 text *inside* the questionnaire's deliberate generic error. The newer source asserts both the generic questionnaire retry notice and the separate backend error, and must be retested.
- Isolated independent pure event projection: 9/9 Node test cases passed locally (not full app proof). Code-quality remains red on repo-wide Prettier, Biome and React Doctor; this includes older baseline debt plus changed-file formatting.

**Acceptance gates still missing:** full latest-head Playwright with all new tests and measured gap across all browser projects; all Node/Fastify/TS/production builds; quality checks without masking existing failures; real authenticated persistent owner/workflow conversation and actual Groq STT, TTS, speech permissions, mute/retry across Chrome/Safari/mobile; independent code/security/a11y review and recorded real provider/Runner dogfood. Broader Growth integration fixture failures are tracked separately and must not be mislabelled as Mator regressions. Do not merge or call M1/M2 10/10 until evidenced.

**Next persona:** Test Engineer to obtain current-head CI results, investigate any browser or backend failures (including file idempotency), then return defects to the Frontend/Backend owner. Independent Reviewer and integration/dogfood must reject any missing real service proof. Git/Release must retain draft PR #15 and update its checkboxes from actual runs.

## M1/M2 remediation checkpoint, 2026-11-01 (latest verified head before this documentation update: `cb9afb5`)

**Objective:** Close delayed Groq speech-to-text / conversation-switch race, expose previously skipped lint checks, and independently verify the affected UI with Playwright. Scope is M1/M2 only; no Growth database/pipeline work was claimed.

**Implementation:**
- `2c13c5f`: added recording delivery generations in `voice-support.ts` and `use-voice-session.ts`; a response from an invalidated recording cannot call the latest send callback. Invalidations run on thread switch, new thread, close, workflow/selected-thread change, unmount, and superseding voice input. `dashboard-shell.tsx` synchronously invalidates pending STT before thread changes. Added two Node tests and the delayed STT browser test that holds the old response until after switching threads.
- `43c80be`: CI now runs both ESLint and Biome lint after a formatting failure if their setup/format steps ran, without treating formatting failures as successful.
- `cb9afb5`: addressed observed frontend lint issues (JSX entity, unused icon import, callback/effect dependencies, stable selected Growth template ID).

**Executed verification on `cb9afb5`:**
- [Integration run 41311038988](https://github.com/surdma/utomator/actions/runs/41311038988): **85/85 Playwright tests passed**, including new delayed STT switch regression across five browser projects; frontend Node **113/113**, backend **169/169**, hosted **6/6**; frontend/backend builds and types passed. Broad fixture/integration remains **17/19** (the two previously documented Next.js workspace and Growth workspace cases).
- [Quality run 41311038971](https://github.com/surdma/utomator/actions/runs/41311038971): frontend ESLint with `--max-warnings 0` **passed**; Prettier **27 files still need formatting**; backend Biome formatting **15 errors** and full Biome lint **192 warnings**; React Doctor score **51**, **131 warnings**. The React Doctor warning count also appears on `main`, but do not assume every warning is unrelated.

**Review:** The previous source-review finding (stale STT response submitted to another thread) is now addressed with code and browser regression, but no independent reviewer has approved the complete PR. Browser tests use controlled STT/API fixtures; this is not real external Groq verification.

**Outstanding blockers (explicitly not COMPLETE):** Prettier/Biome cleanup and changed-file ownership split; all-release code-quality gate; live microphone permissions in desktop/mobile browsers, real account-backed Groq STT and TTS, persisted conversation/owner isolation and Runner dogfood; independent reviewer approval. Do not merge PR #15. Real provider access and a credentialed executable checkout were not available in this session. Next persona: Refactor/Maintenance for formatter hygiene and Test/Reviewer/Dogfood for remaining validation gates.

## M1/M2 attachment composition and annotation checkpoint (2026-11-01)

**Scope requested:** replace the attachment link and pencil-only editor in chat with selectable image thumbnails opening an annotation modal; support multiple image/TXT/README assets, grid previews, file names as asset metadata, user-authored captions/prompts, no implicit upload/send on file selection, text-mode dictation as draft, and voice-only stop-to-send (except when preparing captioned assets).

**Repository baseline and root causes (verified):** previous composer consumed `files?.[0]`; `useMatorChat.attachFile` called `send(file.name, [uploaded.id])` immediately; user events retained only `attachmentIds?.[0]`; chat preview used external `<a>` and pencil-toggle inline editor, even though `StudioDialog` and the existing marker canvas were available. Real visual review studio `components/dashboard/reviews/visual-review-panel.tsx` is distinct and supports circle/rectangle/freehand actions, which the Mator marker schema does not yet support.

**Implemented in draft branch:** 
- Backend `mator-attachments.ts` validates raster image MIME/extension plus TXT/README and rejects active formats (SVG/HTML), PDF and video; `mator-agent.ts` validates owner-scoped attachment IDs, max 12 and persists attachment name/MIME/marker list in new backward-compatible `attachments` field alongside legacy `attachmentId`. `mator-routes.ts` hydrates the latest marker metadata when fetching chat history.
- `mator-composer.tsx` stages multiple local files as an unsent draft, shows compact thumbnail grid, permits selecting/removing and adding per-image notes, and only uploads/persists markers/sends the grouped IDs with caption on explicit Send. Failed sends retain uploaded IDs and draft for retry. Voice-only attachments remain manual-send drafts.
- `mator-attachment-preview.tsx` replaces external image link and pencil with clickable thumbnail and native `StudioDialog` containing the marker canvas, per-image comments, explicit Save/Cancel; `operator-chat-panel.tsx` renders multi-thumbnail gallery; draft state is keyed by conversation. Text-mode transcription appends to editable input; voice-only without attachments retains stop-to-send.
- Node and Playwright tests added for validation, draft select, upload timing, annotation, gallery send and reload.

**Actual CI evidence:**
- [Run 41314723837](https://github.com/surdma/utomator/actions/runs/41314723837), code head `9aa08b4`: frontend Node **115/115**, backend **171/171**, hosted checks **6/6**, frontend/backend build/typecheck passed. New multi-image draft/annotation/reload browser scenario **5/5 passed** (desktop, tablet, small/mobile and WebKit). Browser run overall **89 passed / 1 failed**: WCAG color contrast in the existing connected-provider onboarding card on small-mobile Chromium; requires separate baseline comparison/repair. Broad integration fixture **17/19**, same pre-existing workspace/Growth cases. The entire CI is therefore **NOT GREEN**.
- [Quality run 41314723936](https://github.com/surdma/utomator/actions/runs/41314723936): frontend Prettier still flags **27 files**, backend Biome formatter **16 errors** and Biome lint **192 warnings**, React Doctor score **50** with **135 warnings**. Frontend ESLint reports no additional errors. Do not claim full quality clearance.

**Remaining gaps and acceptance blockers:** The in-chat annotation modal currently offers pin markers and comments with persistent per-image IDs, but **does not yet reproduce every tool from the original VisualReviewPanel** (rectangle, ellipse, freehand, action tags). Mator's stored marker schema is point-based; a faithful full-studio migration requires a versioned richer annotation contract and consumers/tests. Groq vision currently generates captions for only the first three image IDs in a turn although more can be attached; review user-facing processing limits before calling 12-image analysis complete. Browser's small-mobile connected-provider color contrast and full code-quality gates remain red. No live linked account/Groq provider and no independent reviewer/Dogfood signoff. **Status: IMPLEMENTED IN DRAFT / TARGETED BROWSER VERIFIED / NOT COMPLETE.** Keep PR #15 draft and unmerged.

## M2 annotation-modal restoration (2026-11-01)

**Objective:** Put the existing YAML review studio back on chat images and on the workflow annotation dialog, without a second annotation engine. Approach 1 (approved): one `VisualReviewPanel`, one `POST /visual-reviews` path, clone-mode edits only.

**Source:**
- `6a89854` — `annotate_image` and `PATCH /mator/attachments/:id/markers` accept an optional `reviewId`. Bad UUID shape is `400 Invalid review reference`. A resolver miss is `400 Review does not exist` (no invented link). Chat event projection includes `reviewId`.
- `f60a689` — pencil on chat thumbnails opens the shell studio; saved assets show a YAML chip; pending drafts keep `reviewId` until send; workflow annotation dialog gains "Annotate further" (`tagExistingReview`, new version, original untouched).
- Uncommitted follow-up on this branch — the shell returns the markers promise (a `void` call was hiding link failures); a saved review whose PATCH fails shows `Saved as review <id> but could not link to the chat message. Re-open the annotation editor to retry.`; fetched attachment bytes use `validateReviewImage` (PNG/JPEG/WebP, 2 MB — the live cap, not a separate 8 MB path); the typed or dictated draft is the review `note` on chat uploads only, sliced to 1500 characters, and is not posted as image source.

**What this does not change:** Run-screenshot review stays on the capture path. Quick pins remain when there is no pipeline page and handle. `WorkflowArtboard` still is not mounted; the live plan surface is `workflow-plan-editor.tsx`. "Annotate further" is wired on the unmounted dialog. Saved reviews in chat already open clone mode through `onEditReview` → `tagExistingReview`.

**Local evidence:** Backend mator scope was 43/43 at `6a89854` (branch-wide growth YAML / EBUSY / handle failures were reproduced on a stash and are not this change). Frontend Node was 125/125 at `f60a689`. After the follow-up, `annotation-link`, `mator-chat-ui`, and `dashboard-component-structure` were 38/38. This is not a browser run and not live LinkedIn, Groq, or microphone proof.

**Status:** IMPLEMENTED → TEST (local Node only) → REVIEW open → DOGFOOD not run. Do not call the restore complete, and do not merge PR #15 on this entry.
