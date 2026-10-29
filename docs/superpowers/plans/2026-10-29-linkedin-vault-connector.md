# Implementation Plan — LinkedIn Vault Connector

**Spec:** `docs/superpowers/specs/2026-10-29-linkedin-vault-connector-design.md` **Repo:**
`C:\Users\olaitan\Dev\utomator` (pnpm + Turborepo; backend = Fastify 5 + Playwright + Drizzle at
`apps/backend`; frontend = Next 16 at `apps/frontend`)

Each task is bite-sized with its own verification. Phases are ordered; 3 depends on 1, 4 on 2+3, 5
on 4.

**Ground-truth notes for implementers (from code reading):**

- `apps/backend/src/db/documents.ts` enforces a namespace allowlist (line ~39) and a 512 KB JSON
  payload cap (`payload()`). The vault record must be a _small encrypted envelope_
  (ciphertext/iv/tag), not raw JSON — store the plaintext JSON string encrypted, base64 fields. A
  LinkedIn `storageState` snapshot (~50–150 KB) fits comfortably once encrypted+base64; still add a
  pre-encrypt size guard (reject > 350 KB plaintext) so one bloated profile never breaks the DB.
- `DocumentStore` is created per-owner; `ownerId` is server-derived, never from request bodies
  (`checkedOwnerId`).
- `src/browser/session.ts` `BrowserSession.open()` currently refuses hosted sign-in paths; the vault
  mode is a new branch, not a modification of `attached`/`isolated` semantics.
- The Next.js catch-all proxy (`apps/frontend/app/api/[...path]/route.ts`) **cannot upgrade
  WebSockets**. The broker WS must ride the deployment's public reverse proxy directly to backend
  `:3101` (the same proxy pattern already required for the OAuth HTTPS callback). In dev, the
  frontend connects directly to `http://127.0.0.1:3101`. This constraint is a _documented deployment
  requirement_, not something to engineer around in-process.
- `ConnectorService` status is derived in `list()` from the account store + connection records +
  live `sessions` map. A new `re-auth-required` status is computed state, not stored — derive it as
  "account exists, verified record pending re-auth, vault record present".

---

## Phase 1 — Session vault (crypto + storage)

### Task 1.1 — Vault envelope module

**File:** new `apps/backend/src/core/session-vault.ts`

- Types:
  `VaultPayload { platform:'linkedin'|'x'; capturedAt; cookies:Cookie[]; originState:Array<{origin,localStorage,sessionStorage}>; browserHints:{userAgent,viewport:{width,height},locale?,timezone?,deviceScaleFactor?}; lastVerified:{at,method:'owner-control'} }`.
- Envelope: `VaultRecord { ciphertext:string; iv:string; tag:string; v:1 }` (AES-256-GCM, pattern
  mirrored from `src/core/linkedin-publisher.ts`).
- Key handling:
  - Load `UTOMATOR_SESSION_ENCRYPTION_KEY` (64-hex → 32 bytes; validate like
    `LINKEDIN_TOKEN_ENCRYPTION_KEY`).
  - `deriveOwnerKey(master, ownerId)` = HKDF-SHA256(master, salt=ownerId,
    info='connector-session-vault') → 32 bytes.
- API: `encrypt(ownerId, payloadJsonString)` / `decrypt(ownerId, record)` / `vaultKeyConfigured()`.
- Refuse the whole browser-connector tier when the key is missing in hosted mode
  (`UTOMATOR_INTERNAL_OWNER_ID` set or `HEADLESS==='true'`).

**Verify:** unit test `apps/backend/tests/session-vault.test.ts` — roundtrip; per-owner isolation
(encrypt under owner A fails to decrypt under owner B); wrong-key decrypt returns a typed
`VaultDecryptError` (not a thrower exception at consumption sites); deterministic HKDF vector;
missing-key flag.

### Task 1.2 — Vault storage adapter

**File:** extend `apps/backend/src/core/session-vault.ts` and `apps/backend/src/db/documents.ts`

- Add `'connector-session-vault'` to the namespace allowlist in `documents.ts` `validated()`.
- Adapter functions over an injected `DocumentStore`:
  - `saveVaultPayload(documents, connectorId, payload)` — serialize → encrypt →
    `put('connector-session-vault', connectorId, envelope, existingVersion ?? 0)` (CAS bump like
    `connectors.ts` `update()`).
  - `loadVaultPayload(documents, connectorId)` — get → decrypt → parse+validate shape; on
    `VaultDecryptError` re-throw as `VaultDecryptError` (callers map this to `re-auth-required`,
    never a 500).
  - `deleteVault(documents, connectorId)` — `remove(..., existingVersion)`.
  - `hasVault(documents, connectorId)` — get DocumentRecord (no decrypt) for status derivation.
- Pre-encrypt size guard > 350 KB plaintext → error 'LinkedIn session snapshot too large' (do not
  silently truncate).

**Verify:** unit tests with an in-memory fake `DocumentStore`; tenant-isolation extension later in
Phase 6.

### Task 1.3 — Commit + env docs

- `.env.example` / `.env.hosted.example`: add `UTOMATOR_SESSION_ENCRYPTION_KEY` with the same
  warning style as the token key.
- Commit Phase 1.

---

## Phase 2 — Vault-backed headless browser mode

### Task 2.1 — New `BrowserSession` branch `vault`

**File:** `apps/backend/src/browser/session.ts`

- New optional constructor/open option:
  `open(platform, accountId?, opts?: { vault: VaultRecord; hints: browserHints })` or a dedicated
  `openFromVault(vaultPayload)` — pick the shape with less churn on callers (recommend: separate
  method `openRestored(payload)` so existing `open()` stays untouched).
- Implementation:
  - throwaway dir `.runtime/chrome/scratch/<uuid>` (mode 0o700, deleted in `close()`).
  - `launchPersistentContext(dir, { userAgent, viewport, locale, timezoneId, deviceScaleFactor, reject downloads (acceptDownloads:false) })`
    — always **headless-aware** like today (`HEADLESS` env), never `channel:'chrome'` (hosted nodes
    have no system Chrome).
  - Seed `context.addCookies(payload.cookies)`; replay `originState` via `addInitScript` writing
    `localStorage`/`sessionStorage` per origin document (guard: only run navigation to the origin;
    storage seeding helper lives in this file and is unit-testable).
- `close()` extends to rm the scratch dir.
- Keep the invariant: vault mode is used only for restored sessions; local users' `isolated` profile
  dirs remain authoritative for local mode.

**Verify:** unit test for the storage-seeding helper (jsdom-free: test the generated init-script
string contract); integration smoke deferred to Phase 6.

### Task 2.2 — Readiness probe + post-run re-capture helper

**File:** `apps/backend/src/browser/session.ts` (or small `src/browser/vault-probe.ts`)

- `classifyAuthState(page): 'authenticated' | 'auth-walled'` for LinkedIn:
  URL/`authwall`/`login?session_redirect`/`checkpoint` vs `/feed/` (mirror signals `discover()`
  already trusts).
- `captureSessionSnapshot(context): VaultPayload-shaped object` — `context.storageState()` split
  into `cookies` + `originState`, plus hints injected at launch time (attach to the context object
  by the caller, since `storageState()` doesn't return hints).

**Verify:** unit tests with fixture HTML/URL lists for classifier; snapshot shape test against a
launched dummy context pointing at a local mock (or fixture-limited if no browser in unit env — the
real context test lives in Phase 6).

---

## Phase 3 — Streamed sign-in broker

### Task 3.1 — Broker core

**File:** new `apps/backend/src/browser/streaming-signin.ts`

- `SignInBroker` per stream instance:
  - launch throwaway persistent context in `.runtime/chrome/scratch/<uuid>` (0o700), always headless
    on servers, viewport tuned for streaming (e.g. 1280×800; responsive downscale happens
    client-side), `channel` omitted.
  - navigate to `https://www.linkedin.com/login/` (`navigateWithRetry` semantics — reuse by
    exporting it from `connectors.ts` or duplicating; prefer extracting to
    `src/browser/navigation.ts`).
  - screencast loop: CDP session on the page,
    `Page.startScreencast({ format:'jpeg', quality: adaptive 40–70, maxWidth 1280 })`; emit base64
    frames at stream pace (skip-frame forwarding when the client is behind).
  - input sink: `dispatchMouseEvent` (down/move/up/wheel), `dispatchKeyEvent` (raw key text),
    `dispatchTouchEvent` mapping — no buffering of form values anywhere (operates on raw input
    events only; this is what keeps the password never-stored guarantee).
  - completion detection: reuse the existing authenticated-homepage signal (LinkedIn feed URL +
    owner-link presence trigger — call a `ConnectorService.captureHook` set by the wiring layer).
  - TTL ≈ 10 min; hard cleanup timer; cleanup on WS close (also `.runtime/chrome/scratch/<uuid>` rm)
    regardless of completion.
  - rate limiting: cap input event dispatch rate + minimum screencast frame interval (defensive
    pacing).
- Expose `markers`: on capture the broker yields `{ payload, context }` to the wiring layer which
  runs discover/verify + vault write _inside the still-live context_ before teardown.

**Verify:** unit test of input-event → CDP command mapping table; TTL cleanup test with fake timers;
completion-detector tested against played-back LinkedIn URL fixtures.

### Task 3.2 — WS transport + tickets

**Files:** `apps/backend/src/main.ts`, new `apps/backend/src/core/stream-tickets.ts`

- Add `@fastify/websocket` dependency.
- Tickets: in-memory `Map<ticketId,{connectorId,ownerId,exp,burned}>`;
  `createStreamTicket(connectorId)` → 256-bit random id, 10-min expiry, single use (burn on first WS
  upgrade), owner-scoped.
- Route `GET /connectors/stream/:connectorId/ws` (websocket upgrade):
  - verify ticket (`?ticket=`), burn it, verify token-owner matches `UTOMATOR_INTERNAL_OWNER_ID` in
    hosted mode (same `checkedOwnerId` discipline), reject otherwise.
  - attach to broker instance for the connector; pipe frames out with a 2-in-flight backpressure
    cap; pipe input events in.
- Route `POST /connectors/start-ticket` body `{platform}` — hosted variant of `connector start` (see
  Task 4.2) returning `{ accountId, ticket, wsPath }`.

**Verify:** integration test — ticket burn (second connect rejected), TTL expiry, owner mismatch
rejection, frame passthrough with a stub broker.

---

## Phase 4 — Wiring: connector lifecycle + runner + capabilities

### Task 4.1 — Capture hook inside the broker lifecycle

**Files:** `apps/backend/src/core/connectors.ts`

- Add a hosted path to the sign-in flow: `startStreamed(platform)`:
  - hosted gate: allowed when local desktop sign-in is unavailable (i.e., the current
    `capabilities().browserAvailable === false` branches) **and** `vaultKeyConfigured()`.
  - creates the pending connector id exactly like `start()` (same duplicates/pending guards), but
    boots the `SignInBroker` instead of a local interactive Chrome; navigates to LinkedIn **login**
    page (not feed).
  - registers the completion hook: in broker context → `discover()` → `verify()` →
    `accounts.linkVerifiedSocial()` → connection record `update()` → `saveVaultPayload()` (capture
    payload from the broker context) → audit `session-verified` → close broker.
- Extract `navigateWithRetry` into a shared module so the broker and connector service share retry
  semantics wording.

**Verify:** integration test with a stubbed broker/page (mock push-once completion): record written,
vault written, broker closed, `list()` shows `connected`.

### Task 4.2 — `re-auth-required` status derivation + re-auth path

**Files:** `apps/backend/src/core/connectors.ts`, `apps/backend/src/main.ts`

- `expire(id)`: keep behavior of clearing the connection record; **do not** delete the vault.
  `list()` derives: saved account + no verified record + `hasVault(...)` + platform linkedin/x +
  hosted-mode → `status:'re-auth-required'`.
- New `beginReauth(id)`:
  - guards: account exists, platform browser, vault key configured, no live pending/stream.
  - boots a broker for the **existing** account (navigates to feed first; `classifyAuthState` may
    prove the vault is actually still good → short-circuit to `sync(id)` if authenticated and verify
    passes).
  - otherwise falls through to login; on completion reuses the Task 4.1 hook with the _existing_
    account identity (no discovery overwrite unless identity changed → then `reconnect-required`
    semantics).
- `sync(id)` hosted branch: when no interactive session map entry exists in hosted mode, run the
  vault path instead of erroring: restore (`openFromVault`) → `verify()` → success → connection
  record refresh + post-run vault re-capture; failure → expire-vault-aware status
  (`re-auth-required`), never an exception to the caller.
- `decrypt failure` anywhere → record `re-auth-required` in derived status + audit action
  `reconnect-required` (no new enum values needed in the audit log to keep compat; add
  `'session-restored'` only if the audit type union accepts new members cleanly).

**Verify:** unit/integration: status derivation matrix (records × vault × sessions map), re-auth
happy path with stub, decrypt-failure path, vault-still-valid shortcut.

### Task 4.3 — Disconnect wipes vault + workflow gating

**Files:** `apps/backend/src/core/connectors.ts`, `apps/backend/src/workflows/execute.ts`,
`apps/backend/src/core/runner.ts`

- `disconnect(id)`: additionally `deleteVault(documents, id)` (audit unchanged).
- `requireConnected(...)`: unchanged contract (throws when record is missing) — the runner's
  existing error path already pauses the user's workflows through frontend `connectorReady` gating.
- `execute.ts` pre-run session re-verify: on hosted mode use the vault-mode session from
  `SessionService` (Task 4.5 wiring point lives in `SessionService` if one exists — locate the
  factory that constructs `BrowserSession` in the runner (`src/workflows/*`) and route: hosted →
  vault restore; local → existing modes).
- After a successful run in vault mode: HEAD-OF-LINE rule — `captureSessionSnapshot()` →
  `saveVaultPayload()` (skip write when payload JSON is unchanged) → audit nothing new.
- On mid-run auth wall (`classifyAuthState(page)` inside the existing re-verify hook): call
  `expire()` (record cleared; vault kept) → workflows pause with the derived `re-auth-required`
  status.

**Verify:** integration test with mock context: post-run re-capture writes once, no-op second time;
auth-wall path flips status without throwing 500.

### Task 4.4 — Capabilities endpoint truth

**File:** `apps/backend/src/core/connectors.ts` (`capabilities()`)

- Shape stays backward compatible; adds:
  - `browserAvailable` unchanged semantic (desktop interactive).
  - `hostedSignIn: boolean` — true when hosted mode + vault key configured.
  - `vault:` `{ enabled: boolean }`.
- Frontend consumes `hostedSignIn` (Phase 5); local-only deployments keep current behavior exactly.

**Verify:** unit test matrix: local no key / hosted with key / hosted without key.

---

## Phase 5 — Frontend: streamed sign-in UI

### Task 5.1 — `SignInStream` component

**File:** new `apps/frontend/components/automate/sign-in-stream.tsx`

- Props: `connectorId`, `ticket/streamUrl handed in after start-ticket success`, `onConnected`,
  `onDismiss`.
- Canvas renderer for base64 JPEG frames (latest-frame wins; object-fit downscale); absolute
  `pointer-events` overlay translating:
  - `pointerdown/move/up` → broker mouse events with canvas→viewport scale mapping,
  - `wheel` → scroll,
  - `keydown/keyup` (text-safe) → key events,
  - `pointerdown/move/up` with `pointerType==='touch'` → touch events (phones; suppress browser
    gestures with CSS `touch-action: none`).
- WS reconnection: none needed — single-use ticket ticket semantics; on drop show "Session window
  closed. Try again." state.
- i18n/copy: the security caption from the spec ("You are signing in directly on LinkedIn…").

**Verify:** component test (frame render, scale mapping math, touch mapping) using mocked WS
messages.

### Task 5.2 — Connector onboarding integration

**File:** `apps/frontend/components/automate/connector-onboarding.tsx`

- Consume `hostedSignIn` from capabilities:
  - When `mobileClient || !capabilities.browserAvailable` **and** `hostedSignIn`: "Connect LinkedIn"
    → `POST /api/connectors/start-ticket` → open `SignInStream` inline in the dialog (replaces the
    disabled-button state).
  - Keep every existing local-desktop path untouched.
- New status rendering for `re-auth-required`: amber banner + "Re-authenticate" primary action →
  `POST /api/connectors/:id/reauth-ticket` (new route wiring in `main.ts`, mirrors start-ticket for
  an existing account) → `SignInStream`.
- `Connector` type gains `"re-auth-required"` in its status union; `provider-meta.ts` mapping
  updated if it switches on status literals (check `primaryOperation()`).
- Status/staleness copy per spec.

**Verify:** Playwright e2e (existing config): mock the WS path via `support/connector-mocks.ts`
extension — hosted sign-in flow completes to `connected`; re-auth-required banner appears and flows
back to connected.

### Task 5.3 — WS routing requirement doc

**File:** `apps/backend/docs/connectors.md` + deployment notes

- Document: `/connectors/stream/:id/ws` must be proxied with WS upgrade support by the public
  reverse proxy (same one terminating TLS for OAuth callbacks); Next.js route proxy cannot upgrade.
  Dev: frontend talks to `127.0.0.1:3101` directly (backend origin is configurable via a
  `NEXT_PUBLIC_STREAM_WS_BASE_URL` style env consumed only in hosted/dev extremes).

---

## Phase 6 — Tests, tenant isolation, docs

### Task 6.1 — Backend integration suite

**File(s):** `apps/backend/tests/session-restore.test.ts`, `stream-tickets.test.ts`,
`vault-wiring.test.ts`

- Restore a fixture `VaultPayload` into a real `launchPersistentContext` against a local static mock
  origin; assert classifier + verify interplay.
- Full streamed sign-in happy path with stub LinkedIn pages: start-ticket → WS frames under a fake
  client → synthetic login interaction → capture → vault record → `list()` connected.
- Expiry loop: run starts, auth-wall detected, `expire()` fires, status derives `re-auth-required`,
  new broker re-auth revives it.

### Task 6.2 — Tenant isolation extension

**File:** `apps/backend/tests/tenant-isolation.test.ts`

- `connector-session-vault` namespace: owner A cannot read/write owner B's vault document via the
  shared document store (per-owner instance semantics), and `deriveOwnerKey` isolation test (A
  decrypting B's envelope throws).

### Task 6.3 — Frontend e2e + regression sweep

- Extend `apps/frontend/tests/connector-states.test.ts` + `connector-sync.test.ts` mocks for the new
  capability flag and statuses; run the existing full suite to confirm the local desktop paths
  regressed nowhere.

### Task 6.4 — Docs + final commit

- Update `apps/backend/docs/connectors.md` ("no cookies stored" section → vault contract:
  encrypted-at-rest, per-owner HKDF, rolling refresh, disconnect deletes vault) and the auth runbook
  threat model entry.
- `pnpm turbo build && pnpm turbo test` (or repo equivalents) green; final commit.

---

## Milestone ordering / riskiest first

1 (vault): pure crypto — do first, it unblocks everything else. 2 (session restore): independent of
1 end-to-end but together they're the core. 3 (broker): largest unknown (input fidelity, streaming
perf) — prototype early within the phase. 4 (wiring): mechanical once 1–3 exist. 5 (UI): can be
built against stub brokers in parallel with Phase 4.

## Risk register (build-time)

- **LinkedIn markup drift** — `discover()`/`verify()` selectors are already maintained here; broker
  uses the same signals only.
- **Streaming performance on mobile networks** — adaptive quality + skip-frames; degrade to lower
  viewport scale early.
- **WS proxying at deploy time** — documented requirement task 5.3; verify with the actual reverse
  proxy before release.
- **storageState size** — pre-encrypt guard; if ever exceeded, persist cookies-only and flag
  `incompleteState:true` in the envelope (localStorage is the least critical part for LinkedIn
  auth).
