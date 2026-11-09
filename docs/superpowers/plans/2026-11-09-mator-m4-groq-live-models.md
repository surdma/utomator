# M4: Groq live-model integration execution plan

> **Status on 2026-11-09: INVESTIGATED / PLANNED, not IMPLEMENTED or validated for live discovery.** Active issue: [#25](https://github.com/surdma/utomator/issues/25). This branch begins at `main` commit `244af7e270ce83fb2940319a26a8d1a45dea7956` after PRs #15, #19 and #20 merged. This initial change is documentation only; no M4 production source or tests have been modified.

## 1. Outcome

Make Mator's chat model selection driven by an authenticated Groq model response instead of an October 2026 static list. Apply saved owner model, temperature and reasoning settings to later real requests only where the model supports them. Keep provider credentials private, report degraded/unavailable states correctly, and **never equate public pricing with verified account quota or free entitlement**.

This is a scoped provider/capability workstream, **not** a redo of M1–M3 chat, voice or Runner and **not** the M5 Growth persistence migration.

## 2. Actual merged implementation: keep what works

| Layer | Inspected source at `main` | Existing behavior to preserve |
| --- | --- | --- |
| Model catalog | `apps/backend/src/infrastructure/mator/mator-models.ts` | `MATOR_MODEL_CATALOG` and per-role filtering currently static, labels include `tier`, `price` and `notes`; retain compatibility while replacing misleading claims |
| Owner settings | `apps/backend/src/infrastructure/mator/mator-settings.ts` | encrypted per-owner Groq credentials, settings CAS, saved `modelId`, `temperature` finite 0–2 (default 0.2), reasoning effort separately persisted |
| Provider SDK | `apps/backend/src/infrastructure/mator/mator-groq.ts` | Groq SDK, structured JSON-schema completion and moderated/action turns; `completeMatorTurn` currently forwards temperature and reasoning arguments without per-model gating |
| Business caller | `apps/backend/src/infrastructure/mator/mator-agent.ts` | obtains authorized stored/env key, passes selected model and settings, maintains idempotent staged-action semantics and safe errors |
| API | `apps/backend/src/interface/http/mator-routes.ts` | `GET /mator/models` returns static catalogue; settings GET/PUT mask key, preserve owner scope |
| Next boundary | `apps/frontend/app/api/[...path]/route.ts` | allowlisted authenticated Mator GET/PUT routes; no frontend direct Groq key exposure |
| Client | `apps/frontend/modules/mator/components/{mator-api.ts,mator-chat-settings.tsx}` | model selector, explicit temperature Save, stored reasoning controls, async loading and errors |
| Existing tests | `apps/backend/tests/mator-settings.test.ts`, `mator-agent.test.ts`, Mator route tests, frontend settings/quality tests | keep passing settings encryption, CAS, validation, text/voice, approval and request-body assertions |

The temperature vertical slice came through [PR #20 commit fbcd2b2](https://github.com/surdma/utomator/commit/fbcd2b2699c6768c3c095c23f647e0a78615c870). **Do not rebuild the already persisted temperature path.** Confirm its behavior with current tests, then add live provider integration.

## 3. Provider authority and capability boundaries

Official references to re-read on implementation:
- [Groq models endpoint](https://console.groq.com/docs/models), authenticated `GET https://api.groq.com/openai/v1/models` (or SDK `groq.models.list()`).
- [Groq API reference](https://console.groq.com/docs/api-reference).
- [Groq reasoning guide](https://console.groq.com/docs/reasoning).
- [Groq rate limits](https://console.groq.com/docs/rate-limits).

Distinguish these sources of knowledge:
1. **Provider-discovered**: model ID, advertised status, fields actually returned to the authorized server key, last refresh timestamp.
2. **Maintained, documented capabilities**: which model safely supports text chat, vision, moderation, audio, JSON schema, temperature and reasoning effort, and what constraints apply; provider response may lack these fields.
3. **Pricing**: dated published usage pricing, if independently verified. Not proof of a free account allowance or account-specific rate.
4. **Entitlement/quota**: verified only when exposed by a trusted account/provider API. Otherwise `unknown`, never guessed from prices or naming.
5. **Availability**: a discovered listing is not automatically proof a given key can complete all operations. Capability errors and 429 must remain visible.

Do not silently replace a selected retired model or change the reasoning/temperature contract. Before choosing omit-or-reject behavior for unsupported parameters, define a documented per-model policy and obtain product/contract review.

## 4. Read-first investigation checklist

- [ ] Trace all usages of `MATOR_MODEL_CATALOG`, `assertModelRole`, `modelsForRole`, `modelId`, `temperature`, `reasoningEffort`, moderation, image, STT and TTS; identify consumer assumptions and tests.
- [ ] Inspect authentication/owner principal, persisted key envelope and fallback environment key semantics. Establish cache isolation per effective key and tenant.
- [ ] Validate the Groq models list payload and error/status headers using controlled fixtures; obtain real provider response only in authorized dogfood (never check keys into Git).
- [ ] Identify current default model and possible stale/removed model behavior; check actual JSON-schema and reasoning parameter support.
- [ ] Determine response compatibility for existing `GET /mator/models` and client `MatorModelOption`, including stale/error state and no cross-role regression.
- [ ] Confirm existing API proxy authorization, error normalization, timeout and budget/rate-limit hooks before designing new code.

## 5. Contract and design proposal

A safe normalized server model record may expose:
`id`, `displayName`, `role`, `capabilities` (each capability with `supported | unsupported | unknown` plus source), `availability` (known/unknown), `updatedAt`, `stale`. Optional published pricing needs explicit currency, unit, timestamp and source. No `free` badge unless verified entitlement exists.

**Compatibility plan:** maintain `{ models: [...] }` for existing callers, use additive fields and deliberately migrate any `tier` or `price` presentation that wrongly asserts free entitlement. Keep non-chat model roles and current voices intact. API errors include safe stable categories (missing credential, unauthorized, rate limited, timed out, unavailable), optional retry-after and a user-action hint. Do not log raw keys/provider secrets or return internal stack traces.

## 6. Proposed staged implementation (TDD)

1. **M4.1 Contract tests first**: failing test for static-only response, typed source/availability, missing account, invalid model, capability mismatch and expected legacy shape.
2. **M4.2 Backend discovery**: Groq SDK call behind testable adapter; authenticated server-only key lookup; a bounded TTL cache keyed by secure owner/credential identity, with single-flight refresh, short timeout, bounded response, cancellation and safe 401/403/429/5xx handling. Negative cache/retry policy must avoid 429 loops and key leaks. The policy is to be specified by measured provider behavior, not arbitrary retries.
3. **M4.3 Capability layer**: intersection of discovered provider IDs and maintained supported operation matrix, explicit `unknown` for unverified capabilities, conservative supported model selection.
4. **M4.4 Owner settings validation**: preserve saved defaults, validate live-compatible selection, show actionable unavailable-state handling, use owner-scoped CAS to prevent lost updates.
5. **M4.5 Completion parameters**: select only validated request options. Continue to respect JSON action schema, moderation and all other existing Groq use cases. Explicit error if model cannot satisfy Mator's required structured-action contract; no auto-swapping to an unapproved model.
6. **M4.6 Frontend**: support loading/retry/stale, no-key/expired-key, unavailable model, accurate capabilities and optional pricing provenance without overwhelming compact composer. Prevent save of known-incompatible models and preserve existing typed drafts.
7. **M4.7 Contract/feature tests**: mock provider 200, empty list, malformed payload, 401, 403, 429 with retry-after, 500, abort, timeout, cache hit/expiry, owner A/B isolation and rotated credentials, deleted stored default; verify parameters in exact completion request. Tests must be included by `AGENTS.md` configured Vitest runners.
8. **M4.8 Integration/browser**: settings GET→save→reload→completion request, multi-owner isolation, keyboard/screen reader/320–1440 responsiveness, stale/no-key failure. Actual authorized Groq model-list and completion dogfood separate from mocked tests.
9. **M4.9 Independent release gates**: Test Engineer → independent Reviewer/security/contract → Integration/Dogfood → Git/Release; exact-HEAD CI, frontend/backend typecheck, lint, build, unit, feature, browser and existing Mator regression tests.

## 7. Explicit release acceptance

- [ ] Groq model list is provider-backed and account-aware to the extent **provable** from provider response, never an invented plan entitlement.
- [ ] Model choices have verified capability-aware filtering, errors and stale-state behavior.
- [ ] Persisted owner model, reasoning and temperature survive reload/restart and drive exact subsequent compatible Groq request.
- [ ] Missing/revoked key, 429, 5xx, timeout and unsupported JSON/temperature/reasoning do not fabricate a success.
- [ ] No cross-tenant cache leak, no direct frontend provider key access; negative tests and independent security verdict.
- [ ] Original M1/M2 staging, voice, attachments and M3 task UI stay unchanged and covered by regression tests.
- [ ] Running Next + Fastify and credentialed Groq provider exercised, with red/green and dogfood evidence.
- [ ] All required exact-head checks and independent reviewer/Git gates cleared before PR is marked ready.

## 8. Known blockers and risk register

- API key and provider account for real dogfood are not available within this issue-planning action; **do not claim live provider validation**.
- Current catalog's `free|paid` and hard-coded prices may mislead; confirm sources and remove unsupported entitlement claims.
- Model-specific `reasoning_effort`, temperature, JSON schema and image/audio availability are not uniform.
- Stale model list cache and owner/key rotation require care to avoid permission leakage and false availability.
- Current `main` code-quality job [42593221079](https://github.com/surdma/utomator/actions/runs/42593221079) was red on 2026-11-09; a new PR cannot claim release-ready merely on documentation or focused passing tests.
- M3 journal/replay/security P0 remains open in [#24](https://github.com/surdma/utomator/issues/24), independent of M4. Growth storage is [#26](https://github.com/surdma/utomator/issues/26), default workspace is [#27](https://github.com/surdma/utomator/issues/27), and final validation is [#28](https://github.com/surdma/utomator/issues/28).

## 9. Branch / PR structure

- Active branch: `work/mator-m4-live-groq-models-20261109`, base `main` at the above merged commit.
- PR #15's whole M0–M7 list is now decomposed: [#21](https://github.com/surdma/utomator/issues/21) to [#28](https://github.com/surdma/utomator/issues/28).
- This initial doc-only PR should remain **draft**, use `Refs #25` rather than `Closes #25`, and accumulate **only M4** code/tests after the initial contract and test preflight. Subsequent M5/M6/M7 work uses independent issue/branch/PR, with stacking only for real unmerged dependency chains.
- Before production edits, re-inspect the latest repository/CI and update this plan if evidence contradicts it.

## 10. Engineering handoff

**Objective:** authenticated safe Groq model discovery and accurately persisted compatible settings.  
**Status:** INVESTIGATED / PLANNED, documentation branch only.  
**Verified:** current main paths and static catalogue/provider/settings boundary above; temp slice already merged.  
**Files changed in this kickoff:** this Markdown plan only.  
**Executable test evidence for this kickoff:** none; no production code was changed. Historical CI is explicitly linked, not re-run.  
**Next specialist:** API/Contract + Backend first for provider DTO, authenticated discovery adapter and failing tests, followed by Frontend, Test, independent Reviewer, Integration/Dogfood and Git/Release.  
**Prohibited assumptions:** public price proves account free quota; static catalog implies availability; provider success implies every model supports all parameters; merged PR implies release signoff.
