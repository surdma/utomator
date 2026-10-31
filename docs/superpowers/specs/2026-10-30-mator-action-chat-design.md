# Mator Action Chat — Design

**Date:** 2026-10-30  
**Status:** Approved  
**Scope:** End-to-end event/action-oriented Mator chat for a workflow/workspace — UI refresh, Groq LLM integration, settings (API key + toggles), persistence, conversation↔pipeline versioning, attachments with on-image voice markers.

## Intent

Mator is not a generic messenger. It is the operator’s **event-driven, action-oriented** control surface for a workflow: speak or type intents, attach files, stage (or auto-approve) pipeline changes, annotate analytics images with voice-pinned markers, and keep conversation history aligned to that workflow without losing knowledge, truncating mid-sentence, or drifting into hallucinated actions.

## Why now

Chat today is mostly local React state (`useChatMessages`) with a voice deck and command parsing; there is no LLM, no durable conversation store, and no conversation-scoped pipeline history. Settings have no LLM key. The product needs chat again — modern, content-rich, motion-aware — wired through backend + database so refresh, multi-conversation history, and real workflow control all work.

## Goals

1. **Chat as action bus** — User turns become structured events/actions (start/process step, edit workflow YAML/steps, annotate capture, attach files), not only free-text bubbles.
2. **Per-workflow conversations** — Many conversations under one workflow/workspace (folder of threads). Refresh resumes the **active** thread for that workflow. Past threads stay reopenable and continuable.
3. **Conversation↔pipeline versioning** — When a thread changes steps/pipeline, those versions bind to that conversation so Chat A and Chat B do not share a conflicting event history.
4. **Explicit restore** — Switching conversations does **not** swap the live editor YAML. User must choose **“Restore this conversation’s pipeline.”**
5. **Squash mode** — Toggle to stop keeping per-conversation pipeline version history; undo/redo still work via YAML under the hood.
6. **Stage by default** — Proposed mutations stage for confirm; **auto-approve** applies immediately when enabled.
7. **Groq LLM** — Backend calls [Groq](https://console.groq.com/docs/overview) (OpenAI-compatible). Free/default model first; user supplies and can change their API key in Settings. OpenCode is **out of scope** unless we later choose to host an OpenCode server.
8. **Attachments** — Images, PDF, video, docs, screenshots; voice comments on images pin as **markers on the image**.
9. **Voice policy** — Never TTS the user’s input. TTS may speak Mator’s **how**/guidance; **on by default**, user can mute.
10. **UI** — Chat-first Mator surface: modern, natural, content-rich (not sparse), Framer Motion for meaningful motion, **avoid dense redesign** — evolve existing shell/chat rather than invent a new product chrome.
11. **E2E persistence** — Settings preferences, conversations, messages/events, attachments metadata, pipeline version links — all backend + document store.

## Non-goals

- Hosting or integrating OpenCode server/SDK in this phase.
- Eliminating content/post crafts from the product (bias UX toward attachment + action flows instead).
- Replacing the YAML workflow engine or inventing a second source of truth for pipelines.
- Browser-direct Groq calls with the user’s key (keys stay server-side).
- A full second product design system (no glassmorphism blue template takeover).

## Anti-goals (failure even if “it works”)

| Area | Must not happen |
| ---- | --------------- |
| UX | Context window silently loses knowledge; bad formatting; mid-sentence cutoff without graceful handling |
| Logic | Infinite tool/action loops; hallucinated or wrong workflow actions; missing/opaque error handling |
| Reliability | Double submission; racey message ordering; false “submitted/complete” assumptions; token completion cutoffs without recovery |
| Product | Chat that cannot actually perform events or control the workflow as the user intended |

## Decisions locked in brainstorming

| Topic | Choice |
| ----- | ------ |
| LLM provider | Groq via backend; free model default; user API key in Settings |
| OpenCode | Skip unless we later host an instance |
| Key UX | Settings page; chat consumes backend-stored key |
| Thread model | Per workflow/workspace; many conversations; resume active on refresh |
| Past threads | Reopenable + continuable |
| Pipeline history | Versioned with conversation; optional squash |
| Switch conversation | Keep current live YAML until explicit restore |
| Mutations | Stage → confirm; auto-approve optional |
| Toggles | Auto-approve + squash on Settings **and** chat header quick toggles |
| Image voice notes | Pin as markers on the image |
| How TTS | On by default; never echo user speech |
| v1 action surface | **Both** YAML/pipeline mutations and existing craft/operator actions (audit, edit-profile, compose, etc.) |
| Run / process step on confirm | Starts a **real pipeline run** through existing runner APIs (not editor-focus-only) |
| Image voice markers | Persist **transcript text + normalized coordinates** (x/y in 0–1); **no audio blob** in v1 |
| Conversation currency | Exactly one `currentConversationId` per workflow; past threads stay reopenable/continuable; no separate archive-lock state in v1 |

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐     Groq API
│  Frontend   │───────────────▶│  Backend (Fastify)│──────────────▶
│  Mator chat │◀── SSE/poll ───│  mator/* routes  │  openai/v1
│  + Settings │                │  + document store│
└─────────────┘                └──────────────────┘
```

### Components

1. **Operator preferences** — Document namespace `mator-settings` (new): encrypted Groq API key, `autoApprove`, `squashPipelineHistory`, `howTtsEnabled` (default true). Same AES-256-GCM pattern as connector vault / LinkedIn publisher.

2. **Conversation store** — Namespace `mator-conversations`: one record per conversation, keyed under workflow id. Fields: `workflowId`, `title`, `status` (`active` | `archived`), `createdAt`, `updatedAt`, `activePipelineRevisionId` (nullable when squash), `lastMessageAt`.

3. **Message / event store** — Namespace `mator-messages` (or messages as ordered list under conversation with size-aware chunking — **builder call** if document 512KB limit forces split). Each item is an **event**: user text, assistant text/how, staged action, applied action, attachment ref, annotation markers, error. Idempotency key on client submit.

4. **Pipeline revisions** — Extend existing `workflow-revisions` (already allowlisted) so a revision can reference `conversationId` + `messageId` that produced it. Live workflow plan remains the editor source of truth; restore copies a revision into the live plan with CAS.

5. **Attachment store** — Metadata in documents; binary on disk or object path under `.runtime/mator-attachments/<owner>/<conversationId>/` (**builder call** for exact storage given 512KB JSON payload limit). Serve via authenticated download route.

6. **Groq action agent** — Backend module: build context from recent events + current (or conversation-bound) YAML summary + attachment captions; call Groq with **structured JSON output** schema for actions (`edit_step`, `add_step`, `run_step`, `annotate_image`, `explain_how`, `noop`, …). Validate schema; never apply raw free-text as YAML without parse+validate. Cap tool iterations; circuit-break on loops.

7. **Frontend** — Evolve `operator-chat-panel`, `voice-deck`, `use-chat-messages`, settings `owner-pages`; Framer Motion for enter/exit of events, stage sheet, marker pins. Conversation picker + New conversation + Restore pipeline control.

### Request flow (happy path)

1. User opens workflow → load `active` conversation (or create empty) + message events.
2. User sends text/voice/attachment → `POST` with idempotency key → persist user event → Groq structured reply → persist assistant/action events → if action and not auto-approve, return `staged`; else apply + persist revision + return `applied`.
3. Client disables send while in-flight; ignore duplicate idempotency keys server-side.
4. Streaming (preferred): SSE token/event stream with graceful end marker; on abort/timeout, persist partial with `incomplete: true` and UI “Continue” — never silently truncate mid-sentence without status.

### Context & completion policy

- Sliding window of recent events + compact workflow summary + pinned artifacts (open step, selected attachment).
- Summarize older turns into a stored `contextSummary` on the conversation when nearing token budget (**builder call**: threshold and model).
- Responses must complete or emit an explicit incomplete state; UI shows recovery, not a hanging half-bubble.
- Action proposals must cite target step ids that exist (or clearly propose create); reject hallucinated ids with user-visible error.

## Data model (logical)

```
Workflow
  └── Conversation[]          // folder of threads
        ├── settings refs     // inherits owner mator-settings
        ├── MessageEvent[]    // ordered action/chat log
        ├── Attachment[]
        └── PipelineRevision[] // when squash=false; linked on apply
LiveWorkflowPlan              // editor YAML; independent until Restore
```

**Restore this conversation’s pipeline:** loads conversation’s latest bound revision into live plan (CAS); records a system event; does not delete other conversations’ revisions.

**Squash on:** applying actions updates live plan + short undo stack only; no new conversation-bound revision trail. Existing historical revisions remain readable for old threads until optionally compacted (**builder call**: compaction policy out of v1 is fine).

## API sketch (builder may rename to match repo conventions)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET/PUT | `/mator/settings` | Preferences + key set/clear (never echo full key; mask) |
| GET | `/mator/workflows/:workflowId/conversations` | List threads |
| POST | `/mator/workflows/:workflowId/conversations` | New thread; mark active |
| GET | `/mator/conversations/:id` | Thread + cursor messages |
| POST | `/mator/conversations/:id/messages` | Send turn (idempotency-Key) |
| GET | `/mator/conversations/:id/events` | SSE subscribe |
| POST | `/mator/conversations/:id/stage/:eventId/confirm` | Apply staged |
| POST | `/mator/conversations/:id/stage/:eventId/reject` | Discard staged |
| POST | `/mator/conversations/:id/restore-pipeline` | Explicit restore |
| POST | `/mator/conversations/:id/attachments` | Upload |
| PATCH | `/mator/attachments/:id/markers` | Upsert image markers |

## UI direction

- **Preserve** existing Utomator/Mator language (slate surfaces, teal voice accent, Lucide icons). Do **not** replace with generic blue glass SaaS.
- **Chat again:** primary column is the event stream (bubbles + action cards + attachment canvases with markers); composer + mic + attach at bottom; header = workflow name, conversation switcher, New, speaker mute, auto-approve, squash.
- **Content-rich, not sparse:** show useful event cards (staged diff, how block, image+markers) with breathing room — not a wall of chrome, not empty hero void.
- **Motion:** Framer Motion 150–300ms enter/exit for events, stage confirm sheet, marker appear; respect `prefers-reduced-motion`.
- **Stage chrome:** pending action card with Confirm / Reject (existing “Stage this” pattern evolved).
- **Settings:** Groq API key field, model label (free default), auto-approve, squash, how-TTS — synced with header toggles.

## Security

- Groq key encrypted at rest; decrypted only in backend for outbound calls; never logged.
- Owner-scoped document store; authenticated routes only.
- Attachment download authz by owner + conversation.
- Validate all structured actions against allowlisted operation types and workflow schema before apply.
- Rate-limit Groq calls per owner.

## Edge cases (must handle)

- Double-click / retry send → same idempotency key → one user event.
- Concurrent tabs → CAS on conversation + workflow plan; surface conflict reload.
- Missing/invalid Groq key → clear settings CTA, no fake assistant success.
- Groq timeout / rate limit / partial tokens → incomplete event + retry/continue.
- Auto-approve + failed apply → error event; do not claim success.
- Restore when live YAML dirty → confirm overwrite.
- Squash toggle mid-thread → forward-only behavior change; document in UI copy.
- Attachment too large / unsupported type → field-level error, no orphan DB rows.
- Marker edit after apply → new event; optional re-stage if it mutates a review artifact.

## Builder calls (sensible defaults if unspecified)

1. Default Groq model id: a current free/fast Groq chat model available on OpenAI-compatible endpoint (verify against Groq models list at implement time).
2. Message persistence: chunked documents under conversation if payload nears 512KB limit.
3. Attachment binaries: filesystem under `.runtime` for local; pluggable path for hosted later.
4. Transport: SSE for assistant streaming; REST fallback poll acceptable for v1 if SSE hard.
5. Context summary threshold: trigger when estimated tokens exceed ~60% of model context.
6. Max agent action iterations per turn: 3, then force explain + stop.
7. Keep existing command-parser path as fallback when Groq unavailable (degraded mode), clearly labeled.
8. On approval without further answers: v1 = YAML **and** craft actions; `run_step` starts real runs; markers = text + x/y only; one `currentConversationId` per workflow.

## Left to the implementation plan

- Exact route module file layout and test matrix.
- Precise JSON schemas for structured actions.
- Framer Motion choreography details.
- Whether conversation list is a popover or side drawer on mobile.
- Migration steps for allowlisting new document namespaces in `documents.ts`.

## Success criteria

- Refresh on a workflow reopens the same active conversation with history from DB.
- New conversation under same workflow; old one reopenable and continuable.
- Pipeline change in Chat B does not rewrite Chat A’s event/version line; restore is explicit.
- Stage/confirm and auto-approve both work; undo/redo YAML still works with squash on or off.
- User Groq key in Settings powers chat; masked on reload.
- Image + voice produces pinned markers; how TTS on by default; user speech never spoken back.
- No double-posted user messages; incomplete streams surface recovery UI; invalid actions error clearly instead of silent wrong YAML.
- UI feels like chat again — contentful, motion-aware, not a dense redesign of the whole dashboard.
`}