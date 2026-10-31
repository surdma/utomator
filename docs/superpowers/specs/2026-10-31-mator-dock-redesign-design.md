# Mator Dock Redesign — Design (UI/UX only)

Date: 2026-10-31
Status: Approved by owner in-session. Scope is strictly UI/UX; no backend changes.

## Context

The Mator dock (`apps/frontend/components/dashboard/pipeline/operator-chat-panel.tsx`)
is the dashboard's operator chat. The working tree was left mid-redesign by a
stalled earlier pass and did not typecheck (missing
`components/ui/message-scroller.tsx`, missing `pipeline/mator-clarify-form.tsx`,
`Bubble` missing `variant`). This spec supersedes that half-state and the dense
"header + icon list" dock top.

Drivers:
- Remove the dense header; per-workflow thread history becomes a soft pill + popover.
- Compact, tight, text-first composer ("not voice first at all").
- Adopt the shadcn *AI Elements* / *base* component ideas locally, without
  installing the registry (the app deliberately ships no shadcn theme tokens),
  and without copying the `Chat`/`Checkpoint` templates verbatim.
- Better motion (framer-motion), attachments, avatars, badges, skeletons, toasts,
  responsiveness; Playwright-driven UI QA.

Invariants preserved (repo-level):
- Mator stays a deterministic command interpreter + optional Groq reply; no
  autonomous browser/LLM actions; every mutating run needs human approval
  (Confirm/Reject stays; rejection confirmation via alert dialog).
- Evidence honesty: staged/applied/rejected/incomplete states stay truthfully
  labelled; no fabricated receipts. No invented backend settings: "temperature"
  does not exist in `MatorSettingsMasked`, so the settings popover exposes only
  real knobs (chat model, reasoning effort, auto-approve, speak replies,
  moderation). A real temperature field is backend work, out of scope.

## Architecture

Local primitives under `apps/frontend/components/ui/` and
`apps/frontend/components/ai-elements/`, mirroring the shadcn registry API shape
(names, props, composition), styled with the existing slate/teal Tailwind v4
tokens. Headless engines used directly where shipped: `@shadcn/react`
(`message-scroller`, `questionnaire`).

### Foundation (new)
- `ui/badge.tsx` — Badge (default/outline/teal/orange/rose, sizes sm/xs).
- `ui/avatar.tsx` — image-capable Avatar + AvatarImage/AvatarFallback.
- `ui/popover.tsx` — anchored popover (Esc/outside close, scale+fade motion,
  reduced-motion aware).
- `ui/skeleton.tsx` — Skeleton (shimmer via CSS util).
- `ui/switch.tsx`, `ui/slider.tsx` — native input styled controls (switch with
  `role="switch"`/`aria-checked`; slider as discrete input[type=range] with
  labeled stops).
- `ui/toast.tsx` — ToastProvider + useToast (aria-live polite, 3.5s auto-dismiss).
- `ui/alert-dialog.tsx` — destructive confirmation over native `<dialog>`.
- `ui/attachment.tsx` — Attachment parts: root (states idle/uploading/
  processing/error/done, size, orientation), Media (icon/image), Content
  (Title/Description), Actions/Action, Trigger, Group (snap row with edge fade).
- `ui/message-scroller.tsx` — styled parts over `@shadcn/react/message-scroller`:
  Provider/Root/Viewport/Content/Item/Button; keeps autoScroll,
  defaultScrollPosition="end", turn anchoring, preserve-on-prepend, role="log",
  focusable viewport.
- `ui/bubble.tsx` (update) — add `variant="default" | "outline" | "muted"`,
  `align` for footer alignment.
- `ui/message.tsx` (update) — add `MessageGroup` and footer alignment behavior.

### AI Elements (new)
- `ai-elements/message.tsx` — one turn: user = muted Bubble (align end);
  assistant = plain text/Streamdown with MessageFooter actions (Copy with
  confirm-swap, optional retry, "Hear this" TTS). ARIA per registry notes.
- `ai-elements/reasoning.tsx` — collapsible "How · Mator" guidance trace
  (Trace-style line + collapsible content), replaces the always-open bubble.
- `ai-elements/task.tsx` — run-event steps grouped under one collapsible task
  line with running/done/error status titles.
- `ai-elements/plan.tsx` — pending plan steps with per-step states ("x of y").
- `ai-elements/confirmation.tsx` — staged-change card: status Badge, evidence
  text, attachment, Confirm primary + Reject → `ui/alert-dialog` ("Reject this
  staged change?"). Keeps test ids `mator-stage-confirm` / `mator-stage-reject`.
- `ai-elements/checkpoint.tsx` — quiet separator marker for run segments (run id,
  timestamp). Idea from Checkpoint doc, not the template.
- `ai-elements/prompt-input.tsx` — the composer: textarea (1→4 rows), attach
  (Paperclip, `ATTACH_ACCEPT` file input), attachment chips above the field,
  mic icon button, Model Selector popover, Send (spinner while busy),
  Enter/Shift+Enter.
- `ai-elements/queue.tsx` — "sending…" pending-message indicator (send-gate).
- `ai-elements/suggestion.tsx` — kickoff chips (e.g. "Audit my profile",
  "Draft a post") on empty threads.
- `ai-elements/model-selector.tsx` — popover menu over `MatorModelOption[]`
  (role-filtered), tier Badge, current tick.
- `ui/questionnaire.tsx` — styled Questionnaire parts over
  `@shadcn/react/questionnaire`: Root/Progress/Item/Title/Description/Choices/
  Choice/ChoiceInput/ChoiceLabel/Error/Previous/Skip/Next/Submit.
- `pipeline/mator-clarify-form.tsx` (new file) — maps `MatorClarifyQuestion[]`
  to the styled questionnaire; single/multiple choice + freeform + skip; submits
  `formatClarifyReply` through `onSendText`. `data-testid="mator-clarify-form"`.

### Dock anatomy (`pipeline/operator-chat-panel.tsx` rebuild)
1. **Soft context row** (~44px): thread pill (title + workflow Badge) → popover
   (`mator-conversation-switcher`) with prominent "New chat"
   (`mator-new-conversation`), thread list (current tinted, "Now" stamp),
   Restore pipeline (`mator-restore-pipeline`) when bound; gear opens chat
   settings popover; Show/Hide toggle icon.
2. **Transcript** — MessageScroller engine; framer-motion entrances
   (transform/opacity only; disabled under `prefers-reduced-motion`);
   MessageGroup for consecutive user messages; Clarify answered turns collapse
   to a summary bubble; run events render as Task; staged cards render as
   Confirmation; checkpoint marker between run segments; attachment events
   render higher-quality `Attachment` cards with real image previews wrapping
   `MatorAttachmentCanvas`.
3. **Loading** — Skeleton lines while switching threads; suggestion chips on
   empty threads; queue "sending…" while gated.
4. **Clarify dialog** — open clarify renders a compact anchored card above the
   composer (auto-open, not modal) hosting `MatorClarifyForm`.
5. **Composer** — `PromptInput` replaces `voice-deck.tsx`. Voice-only Switch in
   the composer row: ON swaps to a mic-first deck (large listening area,
   interim caption, TTS status), OFF shows the text-first deck. Mic remains a
   small icon in the text deck. Stage strip + incomplete banner compact above.
6. **Settings popover** — chat model selector, reasoning-effort 3-stop slider,
   auto-approve/speak-replies/moderation switches; saves via existing
   `saveMatorSettings` patch; toast on success/failure.

### Responsiveness & a11y
- Mobile: fixed overlay drawer unchanged; popovers flip above the composer when
  short; touch targets ≥44px; reduced motion honored app-wide.
- Contrast ≥4.5:1; aria-label on all icon-only buttons; live regions for
  listening/staged/toasts; keyboard-complete (Tab order, Esc closes).

## Data & state
- All existing props contracts in `operator-chat-panel.tsx` and
  `dashboard-shell.tsx` are preserved (same send/attach/confirm/reject/
  conversations/voice plumbing). New local-only state: popovers open, voice-only
  mode preference (localStorage), toast queue.
- Settings popover reuses `fetchMatorSettings`/`saveMatorSettings`.

## Testing
- `tests/mator-chat-ui.test.mjs` and `tests/dashboard-component-structure.test.mjs`
  updated to the new structure while keeping the durable test ids
  (`mator-chat`, `mator-conversation-switcher`, `mator-new-conversation`,
  `mator-restore-pipeline`, `mator-clarify-form`, `mator-stage-confirm`,
  `mator-stage-reject`, `mator-incomplete-continue`, `mator-mic`,
  `mator-attachment-canvas`).
- Gates: frontend typecheck, build, `pnpm test:frontend`, ESLint + Prettier.
- Playwright (playwright-cli style scripted QA run): open dock, thread
  popover/new chat/switch, send, attach, clarify flow, voice-only toggle,
  settings slider+switch+toast, keyboard-only + 1440px/390px screenshots.
