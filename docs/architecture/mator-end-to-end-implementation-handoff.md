# Mator end-to-end redesign: implementation plan and running evidence ledger

> **Status: PLANNED, not implemented.** Created 2026-11-01. Branch: `work/mator-e2e-tracked-20261101`, base `main` at `c7b5d42c5b0d34488d81bada181035327ee7cb20`.
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
| M0 | Baseline, dependency map, validated plan, PR/ledger | Engineering Lead + Investigator; Git/Release | **PLANNED**; docs-only PR preparation |
| M1 | Every user and assistant bubble content-visible, selectable, intrinsic widths, capped cards, no mobile horizontal scroll | UI/UX → Frontend → Test → Reviewer | PLANNED; earlier patch candidate uncommitted |
| M2 | Header voice-only switch (icon, accessible name, shared persisted store); compact composer, history, focus, accessibility, attachments/errors | UI/UX → Frontend → Test → Reviewer | PLANNED |
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

| Gate | Evidence required | Actual result at creation |
| --- | --- | --- |
| Unit/regression | Node `--test` behavior coverage, registered in explicit package test list | NOT RUN |
| Frontend checks | `pnpm --filter @utomator/frontend test`, `typecheck`, `lint`, `build` | NOT RUN |
| Backend checks | `pnpm --filter @utomator/backend test`, `typecheck`, `build`; Biome format/lint | NOT RUN |
| DB/contract | SQLite + Postgres migration/status, API round-trip, negative auth/isolation cases | NOT RUN |
| Browser | Running Next + Fastify + Playwright CLI; 375/768/1024/1440, desktop/mobile, reduced motion, keyboard, screen-reader landmarks | NOT RUN |
| Integration | Real message→API→store→render; YAML task→Runner events→pipeline UI; Groq selection→completion; Growth CRUD→reload | NOT RUN |
| Reviewer | Independent issue-focused diff and call-site/consumer review | NOT STARTED |
| Dogfood | Real user workflow plus failure paths, screenshots and reproducible evidence | NOT STARTED |
| Git/CI | No production commit until local/review/dogfood gates pass; then branch diff, PR/CI check | BLOCKED |

**TDD rule:** For each change, document failing baseline test or reproducible defect, implementation diff, passing focused test, broadened regression results, and independent verdict. Source-text matches alone do not prove that the browser works. Do not downgrade E2E claims to mocked API tests.

## 6. Environment limits and prohibited claims

At creation time the connected private repository could be read through GitHub but `git ls-remote https://github.com/surdma/utomator.git HEAD` failed in the executable container with `Could not resolve host: github.com`. The environment had Node and Git but no usable private checkout, pnpm workspace install, running Next/Fastify app, or browser session. The prior geometry patch was tested only against synthetic context, not a real checkout. Therefore **no application edits, live browser QA, end-to-end execution, or production validation have been completed**. Documentation-only PR scaffolding must stay draft and must not be promoted as a working redesign.

Never invent a successful LinkedIn edit, Groq availability, observed pipeline task, rate tier, model price, screenshot, migration, test result or commit. Do not commit unfinished production logic to obtain a PR diff.

## 7. Running progress and persona handoff

| Date | Action | Status/evidence | Next owner |
| --- | --- | --- | --- |
| 2026-11-01 | Refreshed Lead, HANDOFF, using-superpowers, create-pr; inspected `main` and relevant Mator/Growth/contracts/docs; compared prior handoff | INVESTIGATED/PLANNED, main `c7b5d42`; no production code modified | Git/Release for draft documentation PR; then Frontend (M1) |
| 2026-11-01 | Created branch `work/mator-e2e-tracked-20261101` at base SHA | Branch creation confirmed; PR and implementation must be separately verified | Git/Release |

### Next handoff: Frontend Engineer for M1

**Objective:** Fix real short user text collapsing into a tiny dark bubble and excessive card widths, including both user-rendering paths. **Evidence:** `operator-chat-panel.tsx` contains `max-w-[85%] min-w-0 flex-0`, `MessageContent` defaults to `flex-1`, and `Confirmation` is width-unconstrained. **Files:** `operator-chat-panel.tsx`, `components/ui/message.tsx`, `components/ui/bubble.tsx`, `ai-elements/confirmation.tsx`, `tests/mator-chat-ui.test.mjs`, dashboard shell, run types and attachment canvas. **Candidate:** prior chat geometry patch (not applied). **Do not assume:** rendered text visibility, voice transcript correctness, browser widths, or tests passed. **Required:** establish runnable checkout; write failing behavioral regression; implement surgical fix; run and record test/typecheck/lint/browser results; hand to independent reviewer. If checkout remains unavailable, preserve patch as uncommitted artifact, report BLOCKED, and do not simulate test success.

### Progress record template for subsequent entries

For each M-ID append: date; owner; verified baseline/root cause; exact files and contracts; red test/repro; diff/commit SHA if any; green local command outputs; review verdict; dogfood evidence; blockers; next persona. Update this file and, when touching Growth runtime, the canonical Growth YAML handoff. Update PR body/checklists to match verified results.
