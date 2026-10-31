# Mator Action Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship end-to-end Mator action chat — Groq-backed, persisted per workflow, stage/auto-approve, conversation-bound pipeline versions, attachments with on-image markers, settings + chat UI — without a dense dashboard redesign.

**Architecture:** Backend owns encrypted Groq keys, conversation/event documents, structured Groq actions, stage/apply/restore against workflow YAML + existing runner; frontend evolves existing operator chat/voice deck/settings into a content-rich event stream with Framer Motion. OpenCode is out of scope.

**Tech Stack:** Fastify 5 + Drizzle document store (`apps/backend`), Next 16 + React 19 + Framer Motion + Lucide (`apps/frontend`), Groq OpenAI-compatible API (`https://api.groq.com/openai/v1`), node:test / existing frontend node:test patterns.

**Spec:** `docs/superpowers/specs/2026-10-30-mator-action-chat-design.md`

## Global Constraints

- Groq only this phase; never call Groq from the browser with the user key.
- Keys encrypted at rest (AES-256-GCM, same pattern as `session-vault` / LinkedIn publisher); responses mask the key.
- Document namespaces must be allowlisted in `apps/backend/src/db/documents.ts` `validated()`; payload ≤ 512KB.
- Never TTS user speech; how-TTS defaults on.
- Stage → confirm by default; auto-approve optional; explicit “Restore this conversation’s pipeline.”
- Switching conversations must not swap live YAML until restore.
- Max 3 agent action iterations per turn; then stop with explain.
- Preserve existing Mator/teal/slate UI language; evolve chat, don’t redesign the whole shell.
- Idempotent message POSTs via client `Idempotency-Key`; incomplete streams must surface recovery UI.
- v1 actions: YAML mutations **and** existing craft/operator actions; `run_step` starts a real run; markers = text + normalized x/y only.

## Review Focus

- Double-submit / retry with same idempotency key → one user event, one assistant turn.
- Missing/invalid Groq key → clear error + settings CTA, never fake success.
- Hallucinated step/action ids → reject with user-visible error, no YAML write.
- Partial/timeout stream → `incomplete: true` event + Continue, never silent mid-sentence success.
- Restore when live YAML dirty → confirm overwrite before CAS apply.

## File map

| Path | Responsibility |
| ---- | -------------- |
| `apps/backend/src/db/documents.ts` | Allowlist new namespaces |
| `apps/backend/src/core/mator-crypto.ts` | Encrypt/decrypt Groq API key |
| `apps/backend/src/core/mator-settings.ts` | Load/save owner Mator preferences |
| `apps/backend/src/core/mator-conversations.ts` | Conversations index, current pointer, messages/events |
| `apps/backend/src/core/mator-attachments.ts` | Metadata + filesystem binaries + markers |
| `apps/backend/src/core/mator-actions.ts` | Validate + apply structured actions (YAML + crafts + run) |
| `apps/backend/src/core/mator-agent.ts` | Groq client, context window, structured output, loop cap |
| `apps/backend/src/core/mator-routes.ts` (or register from `main.ts`) | HTTP + SSE routes |
| `apps/backend/tests/mator-*.test.ts` | Backend coverage |
| `apps/frontend/components/dashboard/settings/owner-pages.tsx` | Groq key + toggles |
| `apps/frontend/components/dashboard/pipeline/use-chat-messages.ts` → `use-mator-chat.ts` | Server-backed chat state |
| `apps/frontend/components/dashboard/pipeline/operator-chat-panel.tsx` | Event stream UI + header toggles |
| `apps/frontend/components/dashboard/pipeline/voice-deck.tsx` | Composer/mic/attach; no user TTS echo |
| `apps/frontend/components/dashboard/pipeline/mator-attachment-canvas.tsx` | Image + pin markers |
| `apps/frontend/tests/mator-*.test.mjs` | Frontend unit coverage |

---

### Task 1: Document namespaces + settings crypto + store

**Files:**
- Modify: `apps/backend/src/db/documents.ts` (allowlist)
- Create: `apps/backend/src/core/mator-crypto.ts`
- Create: `apps/backend/src/core/mator-settings.ts`
- Test: `apps/backend/tests/mator-settings.test.ts`

**Interfaces:**
- Consumes: `DocumentStore`, env `UTOMATOR_MATOR_ENCRYPTION_KEY` (64-hex) or reuse vault master if already configured — prefer dedicated `UTOMATOR_MATOR_ENCRYPTION_KEY` with fallback documented in `.env.example`
- Produces:
  - `encryptSecret(ownerId: string, plaintext: string): { ciphertext: string; iv: string; tag: string; v: 1 }`
  - `decryptSecret(ownerId: string, envelope): string`
  - `type MatorSettings = { groqKey?: envelope; autoApprove: boolean; squashPipelineHistory: boolean; howTtsEnabled: boolean; modelId: string }`
  - `getMatorSettings(docs): Promise<MatorSettings>`
  - `putMatorSettings(docs, patch, expectedVersion): Promise<number>`
  - Defaults: `autoApprove=false`, `squashPipelineHistory=false`, `howTtsEnabled=true`, `modelId` = current free Groq chat model id verified at implement time
  - Namespace: `mator-settings`, key: `owner`

- [ ] **Step 1: Write failing tests** — roundtrip encrypt/decrypt; owner A envelope fails under owner B; `getMatorSettings` returns defaults when missing; `put` masks that GET never returns raw key (only `groqKeyConfigured: boolean` in API DTO — unit the store keeps envelope).

- [ ] **Step 2: Run** `cd apps/backend && node --import tsx --test tests/mator-settings.test.ts`  
  Expected: FAIL (module missing)

- [ ] **Step 3: Allowlist** `mator-settings`, `mator-conversations`, `mator-messages`, `mator-attachments` in `documents.ts`; implement crypto + settings module.

- [ ] **Step 4: Re-run tests** — Expected: PASS

- [ ] **Step 5: Commit** `feat(mator): add encrypted settings store`

---

### Task 2: Conversations + message events + current pointer

**Files:**
- Create: `apps/backend/src/core/mator-conversations.ts`
- Test: `apps/backend/tests/mator-conversations.test.ts`

**Interfaces:**
- Consumes: `DocumentStore`
- Produces:
  - `type MatorConversation = { id: string; workflowId: string; title: string; createdAt: string; updatedAt: string; lastMessageAt: string | null; boundRevisionId: string | null }`
  - `type MatorEvent = { id: string; conversationId: string; role: 'user' | 'assistant' | 'system'; kind: string; text?: string; action?: unknown; attachmentId?: string; markers?: Array<{ id: string; x: number; y: number; text: string }>; status?: 'staged' | 'applied' | 'rejected' | 'incomplete' | 'error'; idempotencyKey?: string; createdAt: string }`
  - `listConversations(docs, workflowId)`
  - `getCurrentConversationId(docs, workflowId): Promise<string | null>`
  - `createConversation(docs, workflowId, title?): Promise<MatorConversation>` — sets current pointer
  - `setCurrentConversation(docs, workflowId, conversationId)` — does **not** touch live YAML
  - `appendEvent(docs, conversationId, event, opts?: { idempotencyKey?: string })` — same key returns existing event
  - `listEvents(docs, conversationId, { cursor?, limit? })`
  - Message chunking if payload near 512KB (append to `mator-messages` keys `${conversationId}:${chunkIndex}`)

- [ ] **Step 1: Write failing tests** — create two conversations under one workflow; current pointer follows create/set; append with duplicate idempotencyKey returns same id; listEvents ordered; setCurrent does not require revision change.

- [ ] **Step 2: Run test** — Expected: FAIL

- [ ] **Step 3: Implement** conversation index under `mator-conversations` key `workflow:${workflowId}` holding `{ currentId, items[] }` (or equivalent CAS-safe shape)

- [ ] **Step 4: PASS + commit** `feat(mator): persist conversations and events`

---

### Task 3: Action schema validation + apply (YAML, craft, run)

**Files:**
- Create: `apps/backend/src/core/mator-actions.ts`
- Test: `apps/backend/tests/mator-actions.test.ts`
- Modify as needed: hooks into `workflowRegistry` / plan store / `runner` start path already used by dashboard

**Interfaces:**
- Consumes: workflow plan load/save CAS, craft command staging types from frontend parity, runner start
- Produces:
  - `type MatorAction = { type: 'edit_step' | 'add_step' | 'remove_step' | 'run_step' | 'craft' | 'annotate_image' | 'explain_how' | 'noop'; ... }`
  - `parseMatorAction(raw: unknown): MatorAction` — throws typed validation error on bad ids
  - `stageAction(...)` / `applyAction(..., { squash: boolean, conversationId })` — on apply without squash, write `workflow-revisions` entry tagged `{ conversationId, eventId }`; update conversation `boundRevisionId`
  - `restoreConversationPipeline(docs, workflowId, conversationId)` — copies bound revision into live plan via CAS; does not auto-run on conversation switch
  - `run_step` / craft run types call existing run creation (same payload shape dashboard uses)

- [ ] **Step 1: Failing tests** — reject unknown step id; apply edit_step bumps revision + boundRevisionId when squash=false; squash=true updates live only; restore loads bound revision; run_step invokes runner stub/fake.

- [ ] **Step 2–4: Implement, PASS, commit** `feat(mator): validate and apply staged actions`

---

### Task 4: Groq agent (structured output, context, loop cap)

**Files:**
- Create: `apps/backend/src/core/mator-agent.ts`
- Test: `apps/backend/tests/mator-agent.test.ts` (mock fetch)

**Interfaces:**
- Consumes: `getMatorSettings`, `listEvents`, workflow YAML summary, `parseMatorAction`
- Produces:
  - `runMatorTurn(input: { conversationId; userText?; attachmentIds?; idempotencyKey }): Promise<{ events: MatorEvent[] }>`
  - Uses `baseURL: https://api.groq.com/openai/v1`, user key, default free `modelId`
  - Requests JSON schema structured output for `{ how?: string; actions: MatorAction[] }`
  - Builds sliding context + optional `contextSummary`; when over budget, summarize older events into conversation summary field
  - Caps action processing at 3; forces `explain_how`/`noop` after
  - On timeout/incomplete model output → event `status: 'incomplete'`
  - Missing key → typed `MatorConfigError` mapped to 400 with settings hint
  - Degraded mode: if Groq down, optional fallback note — do not invent actions

- [ ] **Step 1: Failing tests** — mock Groq returns actions → parsed events; missing key errors; loop of 5 actions stops at 3; incomplete flag on aborted stream; hallucinated step rejected before apply.

- [ ] **Step 2–4: Implement, PASS, commit** `feat(mator): groq structured action agent`

---

### Task 5: Attachments + image markers

**Files:**
- Create: `apps/backend/src/core/mator-attachments.ts`
- Test: `apps/backend/tests/mator-attachments.test.ts`

**Interfaces:**
- Consumes: `DocumentStore`, `fs` under `.runtime/mator-attachments/<ownerId>/<conversationId>/`
- Produces:
  - `saveAttachment({ conversationId, filename, mime, bytes }): Promise<{ id; mime; size; kind }>`
  - `getAttachmentFile(id)` authz by owner
  - `upsertMarkers(attachmentId, markers: { id; x; y; text }[])` — x,y clamped to [0,1]; text required; no audio field
  - Reject oversized files with clear error (pick limit e.g. 20MB images / 50MB video — document in module)

- [ ] **Step 1: Failing tests** — save+read roundtrip; markers clamp; foreign conversation denied.

- [ ] **Step 2–4: Implement, PASS, commit** `feat(mator): attachment storage and markers`

---

### Task 6: HTTP routes + SSE + wire into `main.ts`

**Files:**
- Create: `apps/backend/src/core/mator-routes.ts` exporting `registerMatorRoutes(app, deps)`
- Modify: `apps/backend/src/main.ts` to register
- Test: `apps/backend/tests/mator-routes.test.ts` (inject pattern like other server tests)

**Interfaces:**
- Routes (JSON errors `{ error: string }`):
  - `GET/PUT /mator/settings` — PUT body `{ groqApiKey?: string | null; autoApprove?; squashPipelineHistory?; howTtsEnabled?; modelId? }`; GET returns masked `{ groqKeyConfigured, autoApprove, squashPipelineHistory, howTtsEnabled, modelId }`
  - `GET /mator/workflows/:workflowId/conversations`
  - `POST /mator/workflows/:workflowId/conversations` — create + set current
  - `POST /mator/workflows/:workflowId/current` — `{ conversationId }` switch without YAML swap
  - `GET /mator/conversations/:id/events`
  - `POST /mator/conversations/:id/messages` — header `idempotency-key` required; runs agent; respects autoApprove (stage vs apply)
  - `POST /mator/conversations/:id/stage/:eventId/confirm|reject`
  - `POST /mator/conversations/:id/restore-pipeline` — body `{ confirmDirty?: boolean }`
  - `POST /mator/conversations/:id/attachments` (multipart or base64 JSON — pick one; prefer multipart if Fastify plugin already available, else base64 JSON for v1)
  - `PATCH /mator/attachments/:id/markers`
  - `GET /mator/conversations/:id/events/stream` — SSE; ends with explicit `event: done`

- [ ] **Step 1: Failing inject tests** — settings mask; idempotent message; stage confirm applies; switch current leaves plan; restore changes plan; missing key 400.

- [ ] **Step 2–4: Implement, PASS, commit** `feat(mator): expose mator HTTP API`

---

### Task 7: Frontend settings + API client

**Files:**
- Modify: `apps/frontend/components/dashboard/settings/owner-pages.tsx`
- Modify: `apps/frontend/components/dashboard/pipeline/api-client.ts` (or new `mator-api.ts`)
- Test: `apps/frontend/tests/mator-settings-client.test.mjs` (pure helpers if any)

**Interfaces:**
- Produces: `fetchMatorSettings()`, `saveMatorSettings(patch)`, form fields for Groq key (password input), auto-approve, squash, how-TTS; show configured/not; never echo full key after save

- [ ] **Step 1: Add UI + client calls wired to `/api/mator/settings`**
- [ ] **Step 2: Manual/typecheck** `cd apps/frontend && pnpm typecheck` (or project script)
- [ ] **Step 3: Commit** `feat(mator): settings page for groq key and toggles`

---

### Task 8: Frontend chat hook — server-backed conversations

**Files:**
- Create: `apps/frontend/components/dashboard/pipeline/use-mator-chat.ts`
- Modify: dashboard shell / pipeline workspace / `operator-chat-panel` consumers to use the hook
- Deprecate local-only seed in `use-chat-messages.ts` (keep thin wrapper or replace call sites)
- Test: `apps/frontend/tests/mator-chat-state.test.mjs` for pure reducers if extracted

**Interfaces:**
- Produces hook API: `{ conversation, conversations, events, message, setMessage, send, confirmStage, rejectStage, newConversation, switchConversation, restorePipeline, settingsToggles, voice policies, pending, error, incompleteContinue }`
- Refresh: load current conversation for active workflow
- Send: generate UUID idempotency key; disable while in-flight
- how-TTS: speak assistant `how` only when `howTtsEnabled`; never speak user transcript

- [ ] **Step 1: Wire load/send/stage/restore against API**
- [ ] **Step 2: Ensure double-click send does not dual-fire (guard + same key)**
- [ ] **Step 3: Commit** `feat(mator): server-backed chat hook`

---

### Task 9: Chat UI refresh — event stream, header toggles, motion, attachment canvas

**Files:**
- Modify: `operator-chat-panel.tsx`, `voice-deck.tsx`
- Create: `mator-attachment-canvas.tsx` (image + absolute markers)
- Use `framer-motion` (`motion` components) for event enter/exit and stage card; honor `prefers-reduced-motion`
- Test: extend `dashboard-component-structure.test.mjs` / add `mator-chat-ui.test.mjs` for testids

**Interfaces:**
- Header: conversation picker, New conversation, speaker mute (how TTS), auto-approve, squash (PATCH settings), Restore pipeline control when viewing non-bound thread
- Stream: content-rich cards for staged actions, how blocks, attachments+markers — not sparse empty states
- Composer: text + paperclip (multi-type) + mic; pending stage confirm/reject
- Markers: click/voice places pin; PATCH markers; display transcript at pin

- [ ] **Step 1: Implement UI against hook; keep teal/slate language**
- [ ] **Step 2: Add testids: `mator-chat`, `mator-conversation-switcher`, `mator-restore-pipeline`, `mator-stage-confirm`, `mator-attachment-canvas`
- [ ] **Step 3: Commit** `feat(mator): action chat UI with motion and markers`

---

### Task 10: Hardening pass — anti-goals

**Files:**
- Tests: `apps/backend/tests/mator-hardening.test.ts`
- Frontend: ensure incomplete Continue button calls send with continue flag or dedicated endpoint

**Cover explicitly:**
- Idempotent replay
- Invalid Groq key
- Action loop cap
- Incomplete event UX path
- Dirty restore requires `confirmDirty: true` else 409

- [ ] **Step 1: Write hardening tests (fail then pass)**
- [ ] **Step 2: Fix gaps
- [ ] **Step 3: Commit** `test(mator): harden idempotency, loops, incomplete, restore`

---

## Spec coverage checklist

| Spec requirement | Task |
| ---------------- | ---- |
| Groq + user key in settings | 1, 4, 6, 7 |
| Per-workflow conversations + resume current | 2, 8 |
| Continuable history + no YAML swap on switch | 2, 6, 8 |
| Version bind + squash + restore | 3, 6, 8, 9 |
| Stage / auto-approve | 3, 4, 6, 8 |
| Attachments + on-image markers | 5, 9 |
| how TTS on; never user echo | 8, 9 |
| UI chat-first, motion, no dense redesign | 9 |
| Anti-goals (loops, double-submit, incomplete, errors) | 4, 10 |
| Both YAML + craft; real run_step | 3 |
| OpenCode out of scope | — (no task) |

## Self-review notes

- Builder defaults from approval: both action surfaces; real runs; text+coords markers; single current pointer.
- Plan avoids OpenCode; attachments filesystem for local first.
- Exact Groq free `modelId` chosen at Task 4 implement time from Groq models list.
`}