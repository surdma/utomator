# LinkedIn Vault Connector — Design

**Date:** 2026-10-29 **Status:** Approved in brainstorming (pending final spec review) **Scope:**
Hosted, multi-user deployment; LinkedIn browser-session connector first. Architecture extensible to
X later.

## Problem

The current LinkedIn connector stores its session only in a Playwright Chrome profile directory on
the machine where the user signed in (`.runtime/chrome/accounts/<id>/`). Sessions are therefore
device-bound: they cannot serve a **hosted** deployment, cannot survive a device change, and never
transfer to the headless Playwright instance a hosted server runs. Interactive sign-in is explicitly
disabled when the backend is hosted (`HEADLESS` mode) and on mobile clients.

Goal: a user on any device (including phone) connects their LinkedIn account once through a remotely
streamed sign-in; Utomator captures and stores the resulting session payload **encrypted
server-side**; headless Playwright restores that session for any workflow run from then on, from any
device.

## Decisions locked during brainstorming

| Decision             | Choice                                                               |
| -------------------- | -------------------------------------------------------------------- |
| Deployment model     | Hosted backend, browser automation runs server-side                  |
| Sign-in path         | Remote streamed sign-in (server-side browser, frames + input relay)  |
| Tenancy              | Multi-user from day one (per-owner encryption, owner-scoped storage) |
| Session expiry       | Pause workflows + in-app re-auth prompt                              |
| Streaming technology | CDP screencast relay over WebSocket (no third parties, no Xvfb)      |

Known and accepted: browser-session automation of LinkedIn violates LinkedIn ToS; this is a
business-risk decision made knowingly. Mitigations carried from the existing codebase (owner-only
actions, human-paced steps, minimal discovery scraping) remain, plus rate limiting on the broker.

## Architecture

Five components. New code is concentrated in three modules; the rest extends existing behavior.

1. **Session vault** — per-owner encrypted store of the LinkedIn session payload. New namespace
   `connector-session-vault` in the existing Drizzle document store (`src/db/documents.ts`), keyed
   `(ownerId, "connector-session-vault", connectorId)`, CAS-versioned writes like
   `src/core/connectors.ts`.

2. **Streamed sign-in broker** (new `src/browser/streaming-signin.ts`) — launches a throwaway
   isolated headless Chromium, navigates to LinkedIn login, exposes a single-use WebSocket endpoint
   `/connectors/:id/signin-stream?ticket=...`, pumps CDP screencast frames out and dispatches
   incoming pointer/keyboard/scroll/touch events back through CDP input. TTL ~10 minutes; browser
   context destroyed on disconnect/timeout.

3. **Capture step** (inside the broker) — on detection of the authenticated homepage (same signal
   `discover()` uses today), snapshot cookies + storageState + browser hints, encrypt, write the
   vault record, then run the existing `discover()` + `verify()` in that same context before
   teardown. Emitted `connected` event flips status through the standard flow. The live context is
   discarded after capture; it is a sign-in tool, not a session keeper.

4. **Vault-backed headless session** (new mode in `src/browser/session.ts`) — restores the vault
   payload into a fresh persistent context (cookies, origin storage seeding,
   UA/viewport/locale/timezone hints) before each run, and re-captures the refreshed session back
   into the vault after each successful run.

5. **Lifecycle flips** — runner auth-wall detection ends in the existing `expire()` path with a new
   `re-auth-required` status; workflows pause via the existing `connectorReady` gate in the
   frontend.

## 1. Capture & vault payload

Captured once at sign-in completion, and refreshed after each successful run:

```
{
  platform: "linkedin",
  capturedAt: ISO8601,
  cookies: [Cookie[]],                      // linkedin.com domains, incl. li_at
  originState: [{ origin, localStorage[], sessionStorage[] }],
  browserHints: { userAgent, viewport, locale, timezone, deviceScaleFactor },
  lastVerified: { at: ISO8601, method: "owner-control" }
}
```

- Cookies captured after the post-login redirect settles on the authenticated homepage.
- **Encryption:** AES-256-GCM (pattern proven in `linkedin-publisher.ts`). Master key from
  `UTOMATOR_SESSION_ENCRYPTION_KEY` (64-hex, validated like `LINKEDIN_TOKEN_ENCRYPTION_KEY`).
  Per-owner subkey = HKDF-SHA256(masterKey, salt=ownerId), 32 bytes. Per-record random 12-byte IV +
  auth tag. Compromise of one owner's subkey cannot decrypt other tenants' records.
- **Storage:** `connector-session-vault` namespace, one record per connector account, CAS-versioned
  overwrite on refresh.
- **Hosted mode without the key:** browser-connector workflows are disabled with a clear
  capabilities error — never downgraded to plaintext-file fallback (no `.runtime` fallback for this
  namespace).
- **Never stored:** the user's password (it is typed only into the streamed LinkedIn page; the
  broker relays keystrokes but never buffers form values), non-LinkedIn-origin data.
  `ActivityMemory` regex guard remains as defense-in-depth.
- **Disposal:** sign-in browser runs in a throwaway temp profile dir, deleted on broker cleanup; the
  vault record is the only durable credential surface.

## 2. Streamed sign-in broker & UX

- `POST /connectors/start` (hosted variant) creates the pending connector, launches the broker
  browser, returns an ephemeral single-use stream ticket (10-min TTL, burnt on first WS use,
  owner-scoped).
- Frontend connects over the existing proxy path; WS upgrade requires ticket + owner auth.
- Server → client: JPEG frames via `Page.startScreencast`, bandwidth-adaptive quality/viewport
  scaling (must be usable on mobile data).
- Client → server: pointer, keyboard, scroll, and touch events → CDP `Input.dispatchMouseEvent` /
  `dispatchKeyEvent` / `Input.dispatchTouchEvent` etc.
- New `SignInStream` component renders frames on canvas with an input overlay, framed with the
  caption: _You are signing in directly on LinkedIn. Utomator never receives your password — only
  the session LinkedIn creates._
- LinkedIn challenges (PIN, risk checks) appear naturally on the frames; the user resolves them
  inline; broker waits within TTL.
- Success path: capture → `discover()` → `verify()` → vault write → `connected` event → standard
  status flow → existing 15-second polling picks it up. No new sync mechanism.
- On WS drop / TTL expiry / crash: broker killed, temp dir deleted, partial attempts leave the
  account in the existing `sign-in-open` state; nothing persisted.

## 3. Vault-backed headless restore & verification

New `"vault"` mode in `src/browser/session.ts` alongside `attached` and `isolated`:

1. Read + decrypt the vault record for the connector id.
2. `chromium.launchPersistentContext(tempDir, { userAgent, viewport, locale, timezoneId, ... })`
   from `browserHints`.
3. `context.addCookies(cookies)`.
4. Seed localStorage/sessionStorage per origin (`originState`) via `addInitScript`.
5. Navigate to LinkedIn and run the readiness probe: authenticated feed URL vs authwall/login
   redirect.

- The temp profile dir is disposable per run — the vault in the DB is the sole durable home of the
  session.
- Exact same verification as today: `verify()` owner-only control ("Edit intro" visibility) is the
  only accepted proof the restored session belongs to the registered profile. Stolen/foreign cookie
  sets fail verify-time.
- Existing pre-run re-verification hook in `src/workflows/execute.ts` / `src/core/runner.ts` is
  reused.
- **Rolling refresh:** after each successful run, fresh cookies + storageState are re-encrypted into
  the vault (CAS write, skip write when unchanged). Session staleness is bounded by "one run".
- `browserHints` replay keeps the client fingerprint consistent across runs and fleet nodes,
  reducing LinkedIn risk-checks.

## 4. Lifecycle, expiry, re-auth

- Auth-wall/login-redirect detected mid-run → existing `expire()` path → new status
  **`re-auth-required`**.
- That user's workflows pause through the existing `connectorReady` gating; other tenants
  unaffected.
- Connector-onboarding shows an amber "Session expired — re-authenticate" action; accepting
  relaunches the broker for the **existing** connector id, so the re-signed-in session re-binds to
  the same profile.
- `Disconnect` semantics expand: wipe connector metadata **and delete the vault record** — the vault
  must not outlive a disconnect.
- Vault decrypt failure / unknown key (e.g. key rotation) is surfaced as `re-auth-required`, never
  as a server error to the runner.

## 5. Error handling summary

| Condition                | Behavior                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| WS drop mid-sign-in      | Broker killed on disconnect timer; account stays `sign-in-open`; retryable               |
| TTL expiry mid-challenge | Broker torn down; `sign-in-open`; nothing persisted                                      |
| Vault decrypt failure    | Status `re-auth-required`; workflows pause; user re-authenticates                        |
| Mid-run auth wall        | `expire()` → `re-auth-required`; user prompted                                           |
| Missing vault key config | Browser workflows disabled with explicit capabilities error                              |
| Key rotation (old key)   | Vault records undecryptable → `re-auth-required` (re-auth re-encrypts under current key) |

## 6. Testing

1. **Unit (backend):** vault envelope roundtrip, per-owner key isolation, wrong-key →
   `re-auth-required` (not exception), capture payload shape validation, HKDF derivation
   determinism.
2. **Integration (backend):** broker WS handshake (ticket burn, TTL, owner mismatch), input dispatch
   mapping, capture-on-authenticated-redirect against a mocked LinkedIn, `verify()` within the
   broker context.
3. **Restore:** fixture cookie/storageState sets replayed into a real persistent context against a
   local mock site; readiness probe classification (feed vs authwall); post-run re-capture CAS
   behavior.
4. **Frontend e2e (existing Playwright config):** stream panel render, input relay, success status
   flip, `connectorReady` workflow gating, re-auth prompt flow.
5. **Tenant isolation:** extend `tests/tenant-isolation.test.ts` to cover the
   `connector-session-vault` namespace (no cross-owner reads/writes).

## 7. Out of scope (v1)

- Migrating the X connector onto the vault (architecture allows later).
- Multi-account-per-user beyond the current connector model.
- Cookie/import channels other than streamed sign-in (no manual upload, no local-agent upload).
- Any non-LinkedIn platform.

## Files touched (expected, indicative)

- New: `apps/backend/src/browser/streaming-signin.ts`, session vault module (e.g.
  `apps/backend/src/core/session-vault.ts`), frontend `SignInStream` component.
- Extended: `src/browser/session.ts` (vault mode), `src/core/connectors.ts`
  (start/capture/disconnect/expire wiring, `re-auth-required` status), `src/main.ts` (WS route +
  ticket endpoints), `src/workflows/execute.ts` / `src/core/runner.ts` (re-auth-required surfacing),
  frontend `connector-onboarding.tsx`, capability endpoint.
- Config/docs: `.env.example` + `.env.hosted.example` (`UTOMATOR_SESSION_ENCRYPTION_KEY`),
  `apps/backend/docs/connectors.md` update of the "no cookies stored" contract, tenant-isolation
  tests.
