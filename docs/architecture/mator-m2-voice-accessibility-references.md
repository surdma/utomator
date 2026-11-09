# M2 Mator composer, conversational voice and clarification architecture

> **Status:** M2 investigation and integration design, 2026-11-01. This page documents observed code and the revised user requirements, not a deployed or tested feature. Implement on draft PR #15, `work/mator-e2e-tracked-20261101`. The canonical status tracker is [mator-end-to-end-implementation-handoff.md](mator-end-to-end-implementation-handoff.md).

## Product requirements (latest)

1. Voice-only **mode switch belongs in the composer**, not the header. Text entry is default. One persisted preference via `mator-voice-preference.ts`. Both text and voice decks must expose an accessible labelled switch, with settings and attachments accessible in either mode. The mute control is separate from voice-only mode.
2. Composer uses `min-w-0`, fixed/shrink-safe icon touch targets, `flex-nowrap` action rows and adaptive model labels. Input can wrap *user content*; **action controls must not wrap or overflow**. Test 320/375/768/1024/1440 CSS px, long labels, browser zoom and RTL.
3. The chat settings trigger belongs in the composer. Use the existing `MatorChatSettings` Popover/Slider/Switch, not a second state store. Surface actual persisted capabilities only: model, reasoning effort, auto-approve, speak replies, moderation. Auto-approve must clearly explain safety implications and must not bypass provider permissions, explicit authorization or action review. Do not invent a temperature slider without a backend-supported validated value and real Groq request wiring (M4).
4. Mator conversational audio: use Groq-backed `whisper-large-v3-turbo` STT and `canopylabs/orpheus-v1-english` TTS when available, using the existing authenticated server proxy and stored key. Fall back to browser speech where permitted; do not claim completed-recording audio can be handed to Web Speech recognition (that API transcribes *microphone input*, not a Blob). On failed server transcription, offer a **new recording** via the browser recognition method, clearly indicating the changed provider. On failed TTS, provide native `speechSynthesis`, and preserve readable text in all cases. Include mute, cancel and no-autoplay controls, precise audio lifecycle cleanup, race suppression and consent/retention notices.
5. Pipeline speech events must be grounded in the actual Runner/coordinator event stream. Announce a pipeline started, needs approval, succeeded or failed when a **new** verified event arrives and the listener has opted into voiced status updates. Deduplicate by stable event ID across rerender/reload. Avoid announcing confidential failure diagnostics: keep full cause in the expandable pipeline event/evidence panel; speak only a concise safe summary. Do not synthesize statuses from YAML task list presence alone.
6. Clarification: LLM may emit typed `clarify` questions. Existing `mator-clarify-form.tsx` renders the questionnaire choices/input. Extend the validated action schema and formatter to support `url`, `source`, and `file` (optional/required) answer types. File answers must upload through the authenticated attachment endpoint, **remain attached to the clarification submission** and not trigger a separate unsolicited chat message. Preserve idempotency and user input when upload or send fails. A URL field needs URL validation and visible help. Voice-only users must be offered the same questionnaire and an accessible attach button. Never let the LLM directly specify an arbitrary upload endpoint.
7. Attachment list/preview should show a small linked thumbnail and filename; **no full annotation canvas on upload**. Add an explicit 44×44 pencil button for optional annotation; open the editor on demand, manage dialog focus, enable keyboard-friendly textual marker authoring and persist markers only when authorized. Keep original file accessible in a link; never treat audio-only instructions as a completed annotation without evidence.
8. Inline errors are structured small banners/cards (`role=alert`) with a clear short label, retry guidance and preserved draft, not raw long 400 API strings or a full-width chat bubble. Do not expose API keys, provider stack details or opaque backend errors to users. Logs can retain sanitized diagnostics.
9. Guidance, "Applied" status and confirmation/review action cards need natural, content-aware max widths; review at responsive breakpoints. Motion must be subtle and disabled for `prefers-reduced-motion`.

## Observed implementation boundary (PR #15 HEAD as inspected)

- `operator-chat-panel.tsx` **already mounts** `MatorChatSettings` and the shared voice preference switch in its header. Both must move to `mator-composer.tsx`. Do not create duplicate settings popovers.
- `mator-composer.tsx` has an editable text deck, microphone, upload chip and voice-only deck, but the text deck is missing the new voice-only switch and settings. Voice-only deck currently has an exit button rather than the same toggle, and has no attachment access. Existing `mator-voice-preference.ts` uses `useSyncExternalStore` over local storage; reuse it.
- `use-voice-session.ts` already prefers `MediaRecorder` → `transcribeMatorAudio` and `synthesizeMatorSpeech` with browser speech recognition/TTS paths. Recorded-audio transcription failures currently show an error only, not a browser retry. TTS cancellation, object URL cleanup, overlapping speech and autoplay permission failures require explicit regression tests.
- `mator-settings.ts` supports owner-scoped model/effort/autoApprove/howTtsEnabled/moderationEnabled, STT/TTS model + voice. `mator-chat-settings.tsx` saves those values but its local state may become stale compared to `use-mator-chat.ts` until reload; choose one optimistic/refetch contract.
- `mator-routes.ts` accepts `/mator/audio/speech` requests of up to 4000 characters; current Orpheus English docs cap `input` at **200 characters**. Fix provider-side chunking and client sequential playback or enforce a clear short-text speech contract. Never mask a recurring 400 as a healthy TTS request.
- `mator-clarify-form.tsx` currently supports choices and freeform answers, not typed URL/file answers. `use-mator-chat.ts` already has `send(text, attachmentIds)` internally, but its `attachFile` **uploads and immediately sends the attachment**. Introduce a separate upload-only clarification action rather than calling that method from a file questionnaire.
- `MatorAttachmentCanvas` currently renders an interactive board inline with every attachment event and uses `window.prompt` for unnamed marker text; it is not a user-invoked pencil editor. This needs an accessible deferred editor and focus handling.
- `use-mator-chat.ts` auto-speaks final assistant replies in voice-only and 'how' events when speak-replies is enabled. Pipeline runtime events are separate from LLM replies; the new event speech adapter must be correlated and deduplicated.
- `operator-chat-panel.tsx` currently shows `chatError || imageError` as an inline paragraph. Text is preserved on failed send, but visually helpful error recovery is not implemented.
- Tests in `mator-chat-ui.test.mjs` and `frontend-quality.test.ts` currently assert the header switch location. **Update those tests** when moving the switch to the composer; include keyboard/mode persistence/small screens and failed media fallback tests. Do not delete the tests or weaken assertions to make changes appear green.

## Source and API reference registry

**This is the live reference list to consult during implementation and review.** Documentation URLs can evolve; re-check current availability and model deprecations. Provider account entitlements must be checked server-side. Groq is the API provider; *Grok* is a different product.

### shadcn components
- [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller)
- [Message](https://ui.shadcn.com/docs/components/base/message)
- [Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire)
- [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog)
- [Attachment](https://ui.shadcn.com/docs/components/base/attachment)
- [Avatar](https://ui.shadcn.com/docs/components/base/avatar)
- [Badge](https://ui.shadcn.com/docs/components/base/badge)
- [Popover](https://ui.shadcn.com/docs/components/base/popover)
- [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton)
- [Slider](https://ui.shadcn.com/docs/components/base/slider)
- [Switch](https://ui.shadcn.com/docs/components/base/switch)
- [Toast](https://ui.shadcn.com/docs/components/base/toast)

### shadcn AI Elements
- [Chat](https://ui.shadcn.com/docs/ai-elements/base/chat) (inspiration only; do not clone)
- [Checkpoint](https://ui.shadcn.com/docs/ai-elements/base/checkpoint)
- [Confirmation](https://ui.shadcn.com/docs/ai-elements/base/confirmation)
- [Message](https://ui.shadcn.com/docs/ai-elements/base/message)
- [Model Selector](https://ui.shadcn.com/docs/ai-elements/base/model-selector)
- [Plan](https://ui.shadcn.com/docs/ai-elements/base/plan)
- [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input)
- [Queue](https://ui.shadcn.com/docs/ai-elements/base/queue)
- [Reasoning](https://ui.shadcn.com/docs/ai-elements/base/reasoning)
- [Suggestion](https://ui.shadcn.com/docs/ai-elements/base/suggestion)
- [Task](https://ui.shadcn.com/docs/ai-elements/base/task)

### Groq documentation (not Grok)
- [Models](https://console.groq.com/docs/models)
- [Rate Limits](https://console.groq.com/docs/rate-limits)
- [Models List API](https://console.groq.com/docs/api-reference#models-list)
- [Batches Create API](https://console.groq.com/docs/api-reference#batches-create)
- [Batches List API](https://console.groq.com/docs/api-reference#batches-list)
- [Text to Speech](https://console.groq.com/docs/text-to-speech)
- [Orpheus TTS](https://console.groq.com/docs/text-to-speech/orpheus)
- [Speech to Text](https://console.groq.com/docs/speech-to-text)
- [Vision](https://console.groq.com/docs/vision)
- [Reasoning](https://console.groq.com/docs/reasoning)
- [Content Moderation](https://console.groq.com/docs/content-moderation)
- [Service Tiers](https://console.groq.com/docs/service-tiers)
- [Flex Processing](https://console.groq.com/docs/flex-processing)
- [Batch](https://console.groq.com/docs/batch)
- [Model Permissions](https://console.groq.com/docs/model-permissions)
- [Libraries](https://console.groq.com/docs/libraries)
- [Model Deprecations](https://console.groq.com/docs/deprecations)
- [GroqCloud Data Handling](https://console.groq.com/docs/your-data)

**Correct API choice:** Real-time conversational voice uses synchronous `audio/transcriptions`, `audio/speech` and chat-completions. Batch create/list are for asynchronous bulk workloads, **not** per-turn voice conversations. Use voice models the authenticated account can access; verify them at runtime rather than hardcoding free/paid promises. Current Orpheus models replace the deprecated `playai-tts`.

## M2 acceptance and verification

- New and restored threads remain text-first unless the saved user preference says voice-only. Both modes expose the switch and settings at predictable positions in the composer.
- Composer action bar never wraps; upload, mic, mode, settings, model and send have discoverable labels and no horizontal clipping at 320/375/768/1024/1440px. At 200% zoom, accessibility is preserved even if the controls use an overflow menu rather than hidden actions. All icon-only controls have accessible names and sufficient targets.
- Toggle and settings persist and remain synchronized across the header removal, draft/reload and concurrent settings changes; no unsafe auto approval.
- Groq STT→chat→Groq TTS works under authenticated provider access; browser fallback and permission-denied routes are verified. User transcript is visible in text, can be corrected and is never spoken back unnecessarily. Speech overlaps are canceled, media streams and object URLs always released.
- Speech recognition latency and TTS provider errors are recoverable. No one-click automatic fallback silently records more audio or changes providers.
- Questions can request file or URL and submit the answer with correct attached files exactly once. Image/asset editor is opt-in via pencil, keyboard accessible and does not open on upload.
- Only observed pipeline events are spoken, once, with safe brief summaries; detailed failed-task reasons remain in expandable event details. User can mute status announcements.
- Inline 400/429/500 errors and failed uploads are human-readable alerts with retry guidance; no lost draft or API key leakage.
- Tests: new failing regression, focused frontend/backend unit tests, typecheck/lint/build, Playwright desktop/mobile/zoom/reduced-motion/axe and event-driven integration, independent code review and dogfood. The current tool environment has **no executable private checkout**, so none of these can honestly be marked complete yet.

## Next owner handoff

Lead → UI/UX Product Engineer → Frontend Engineer owns composer-mode control placement, settings visibility and error presentation first; Backend + API Contract Engineer handle provider-bounded TTS, recording fallback and typed clarification attachments; Test Engineer owns red/green UI and API tests; Reviewer + Integration/Dogfood follow before Git/Release can approve production commits. Track accurate evidence in the canonical Mator handoff and PR #15.
