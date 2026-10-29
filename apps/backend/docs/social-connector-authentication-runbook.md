# Social connector authentication runbook

Operational and testing guide for the browser-session social connectors
(LinkedIn and X) and the disabled-but-visible API-only connectors
(Instagram, GitHub, Dev.to).

## Threat model and non-negotiable rules

- **No passwords are ever collected, stored, or proxied.** Signing in happens
  only in the account owner's own eyes: an isolated Chrome window inside
  Utomator opens the provider's real HTTPS page, and the owner types their
  credentials there. Utomator never sees them.
- **MFA, consent screens, and CAPTCHAs are never bypassed or scripted.** They
  are rendered on the provider's page exactly as the provider serves them.
- **Verification is evidence-based, never assumed.** A saved profile URL, an
  account label, or an exported OAuth token is never treated as proof of an
  authenticated browser session. Verification looks for an owner-only control
  on the profile page (see *Verification recipes*).
- **Every command is auditable.** `sign-in-opened`, `session-verified`,
  `reconnect-required`, `temporarily-unavailable`, `connection-expired` and
  `disconnected` events are appended to the document store under the
  `connectors` namespace, `audit` key (capped at 200 entries). Audit failures
  never block state changes.
- The stored credential surface is exactly the isolated Chrome profile under
  `.runtime/chrome/accounts/<account-uuid>/`. It may contain session cookies —
  never commit, publish, or sync it. `Disconnect` deletes it.

## Provider capability matrix

| Provider  | Connector type | Primary actions available                      |
| --------- | -------------- | ---------------------------------------------- |
| LinkedIn  | browser (isolated Chrome session) | Connect / Sync / Disconnect |
| X         | browser (isolated Chrome session) | Connect / Sync / Disconnect |
| Instagram | API (pending)  | all disabled — labelled “Connect (API required)” |
| GitHub    | API (pending)  | all disabled — labelled “Connect (API required)” |
| Dev.to    | API (pending)  | all disabled — labelled “Connect (API required)” |

`platformHosts` (apps/backend/src/core/connectors.ts) restricts browser
navigation to `linkedin.com` / `www.linkedin.com` and `x.com` / `www.x.com`.

## Frontend state matrix and the single primary action

The connector dialog (“Connect your social accounts”, rendered by
apps/frontend/components/automate/connector-onboarding.tsx with state data in
provider-meta.ts) shows exactly one context-aware primary action per provider
card. The mapping in `primaryOperation()`:

| State                                  | Pill / badge               | Primary action | Extras |
| -------------------------------------- | -------------------------- | -------------- | ------ |
| Disconnected, never connected          | Not connected              | **Connect**    | opens the isolated Chrome window |
| Sign-in window open                    | Sign-in open               | **Sync**       | “Open sign-in window” secondary; progress rail; 6-second re-poll |
| Connected, verified < 24 h ago         | Connected                  | **Disconnect** | two-step inline confirm; “Use in workspace” |
| Connected but verified ≥ 24 h ago      | Connected + “Session may have expired” | **Sync** | secondary Disconnect |
| API-only network (any state)           | API connector required     | disabled **Connect (API required)** | explanation note |

Feedback banners: `role="status"` for success/offline-info, `role="alert"`
for failures with a **Try again** retry. In-flight commands show a progress
rail (steps + elapsed clock + Cancel). A cancelled or timed-out command
(120 s AbortController) reports “timed out or was cancelled” and leaves the
engine-side Chrome window open for a later Sync.

## Backend contract

Other integrations must not be broken; these routes are additive/stable:

- `GET /connectors` → array of connection rows:
  `{ id, platform, label, handle, profileUrl, status, verifiedAt, authentication }`
  with `status ∈ connected | disconnected | sign-in-open | api-required`.
- `POST /connectors/:id/connect` → isolates a Chrome profile, navigates to the
  saved profile URL, audits `sign-in-opened`, replies
  `{ status: 'sign-in-open', accountId }` (optionally `navigationWarning`).
  Reply mapping: `connected` → success; `sign-in-open` → keep waiting;
  `reconnect-required` → sync again after finishing sign-in;
  `temporarily-unavailable` → keep prior verification; `disconnected` → cleared.
- `POST /connectors/:id/sync` → re-navigates the profile page and runs the
  verification recipe; success stores `verifiedAt` and audits
  `session-verified`; incomplete sign-in returns `reconnect-required` and keeps
  the window open.
- `POST /connectors/:id/disconnect` → closes the window, clears the stored
  record, deletes `.runtime/chrome/accounts/<id>/`, audits `disconnected`.
- The connection record must match `platform + handle + profileUrl` exactly;
  mismatches remove the row from `connected`. Workflows require a verified
  connection (`requireConnected`) and reject an unverified `accountId` with
  HTTP 400.

## Verification recipes

Verification runs inside the isolated window on the account's own profile URL
(host allow-listed, HTTPS):

- **LinkedIn** — wait for the owner-only **“Edit intro”** button on the
  profile. Signed-out visitors only ever see “Follow”.
- **X** — wait for the owner-only **“Edit profile”** link on the profile.

If the control does not appear within 8 s the sync degrades to
`reconnect-required` (MFA still in progress, cookie expired upstream) — the
connection is not silently kept.

## Verification recipes this runbook does not have, on purpose

There is no recipe that measures “signed-in” by scraping cookies, injecting
tokens, or using OAuth to bypass the browser. Do not add one.

## Mock environment (no real provider, no credentials)

Automated coverage lives in apps/frontend/tests and uses Playwright route
interception on `**/api/connectors**` so the dialog can be exercised
without the local engine or any provider:

- `tests/support/connector-mocks.ts` — installable mock API: `GET` serves a
  live account list; `POST connect/sync/disconnect` applies the matching state
  transition and answers like the engine; per-event `behavior` callbacks can
  override payloads, delay, or hang a request. Returns `{ accounts, requests,
  commands }` for assertions.
- `tests/connector-sync.test.ts` — dialog structure (five provider sections,
  empty states), one-primary-action-per-state, server-managed state surviving
  reload, workspace handoff.
- `tests/connector-states.test.ts` — full state matrix: loading skeletons,
  empty, wait (sign-in open + rail + polling), error + retry, cancel, expired
  (stale → Sync), gated API-only, disconnect confirmation, success summary.
- `tests/mocks/mock-provider-signin.html` — self-contained fake provider page
  (sign-in → MFA code `246810` → consent → success/failure) with an owner-only
  “Edit profile” control on its success stage. Covered by
  `tests/mock-provider.test.ts`.

Run them:

```bash
cd apps/frontend
pnpm dev            # or let Playwright's webServer start it (port 3000)
pnpm exec playwright test connector-sync.test.ts connector-states.test.ts \
  mock-provider.test.ts --workers=1
```

The mock fixture is for rehearsal only. **Never type real credentials or real
MFA codes into the fixture** — it is not connected to anything, but the habit
itself is anti-pattern.

## Live-provider run procedure (operator performs)

Prerequisites: local engine running (`node --import tsx src/main.ts` in
apps/backend, listens on 127.0.0.1:3101), Next dev server on 3000
(`pnpm dev` in apps/frontend). Chrome available for isolated CDP use.

1. **Choose Connect.** In Utomator → Profile → Social accounts, open the
   connector. No username, handle or profile URL is collected by Utomator.
2. **Choose the provider.** Click the floating connector button on the
   workspace toolbar. Only LinkedIn and X currently support browser sign-in.
3. **Connect.** Press **Connect**. The engine creates a temporary UUID and
   opens the provider's official home page in an isolated Chrome profile.
   The account directory is unchanged at this stage.
4. **Sign in yourself, in that Chrome window.** Enter credentials, complete
   MFA/2FA, and approve any provider consent screen. Utomator never sees this.
   If the provider fails the sign-in, retry there or start over from Connect.
5. **Verify connection.** Utomator obtains the profile URL from an authenticated
   provider-owned navigation surface, checks an owner-only control on that
   profile, and only then stores the linked identity. A disconnected saved
   account must first use Connect, not Sync. On `reconnect-required`, finish
   the remaining sign-in steps and verify again.
6. **Recovery cases.**
   - *temporarily-unavailable*: network hiccup; prior verification is kept —
     check connectivity in the Chrome window and retry Sync.
   - *Timed out / cancelled*: the window stays open; press Sync when ready.
   - *Ran a workflow that expired mid-run*: the runner calls `expire()`, the
     connection is invalidated and audited as `connection-expired`; reconnect.
7. **Rotate or revoke.** Press **Disconnect** — the engine closes the
   window, clears the record and deletes the stored Chrome profile, so the
   session cannot be reused. No further trace is retained beyond the audit
   entry.

### Live-run safety checklist

- [ ] Sign-in happened only inside the isolated Chrome window, by the owner.
- [ ] No credentials, MFA codes, or recovery phrases were pasted anywhere in
      the portfolio/utomator codebase, terminal, or this documentation.
- [ ] CAPTCHA/consent interactions were performed by the human owner.
- [ ] `.runtime/chrome/accounts/` is git-ignored and was never committed.
- [ ] After testing, the connection was disconnected (profile deleted) or the
      provider session was revoked from the provider's own security settings.

## Desktop Chrome attachment and automatic sign-in detection

- Isolated mode remains the default. Set `UTOMATOR_BROWSER_MODE=attached` only
  for a **local, single-user desktop** with Chrome explicitly started using
  loopback CDP. Modern Chrome may require a separate user-data directory; the
  regular default Chrome profile cannot necessarily be attached. Never expose
  CDP over a network, tunnel, or hosted server. This mode grants the local
  automation process access to tabs and cookies in the attached Chrome profile.
- The connector opens a NEW tab in the explicitly authorized Chrome context.
  It does not replace the user's existing tab. Closing the connector only closes
  its own tab; disconnecting does not remotely sign out the browser itself.
- Sign-in detection probes the current provider page without navigating over
  login, MFA or consent forms. A verified owner-only profile control remains
  necessary before saving an account. The app polls while a connection is
  pending, and offers a manual Verify action if automatic checks cannot complete.
- `GET /connectors/capabilities` distinguishes a local interactive browser
  from a headless/hosted deployment. `POST /connectors/:id/check` performs a
  server-authoritative, deduplicated pending verification. No client-provided
  username, URL or boolean may mark an account connected.
- **Mobile and remote browser limitations:** a server-side Playwright process
  cannot inherit Safari or Chrome cookies from a phone. The UI must not offer
  local browser linking on a mobile device and must not promise same-session
  access without a provider OAuth flow. LinkedIn's existing publishing OAuth
  is separate from automated browser-profile ownership and does not make
  remote browser automation authenticated.

## Proposed headless human interaction contract (not implemented)

Extend the existing Runner checkpoint mechanism rather than inventing a new
YAML interpreter. A reviewed workflow may request a typed checkpoint with:
`type` (text, password, file, consent), `label`, `description`,
`required`, `maxLength`, `accept`, `stepId`, `runId` and
`checkpointId`. The server must validate a fixed allowlist and signed-in
workspace ownership, then release exactly the matching paused step.

Passwords/OTP and CAPTCHA must never be parsed from the provider DOM into
the Utomator app, logged, copied into YAML, or persisted as run evidence.
Preferred approach is the provider's own interactive OAuth authorization or
the explicitly attached desktop browser for MFA. File uploads should use a
bounded one-time upload token, validated type/size and a cleanup lifetime.
Destructive external writes still require separate, explicit approval.
Server restart, disconnect, timeout and cancellation must end pending
checkpoints safely without marking the workflow completed.

## Safety: attached Chrome lifetime

Attached desktop mode uses a single shared CDP transport for the local Utomator
engine. Each connector owns and closes only the tab it creates. It must never call
`Browser.close()` on the user's Chrome process. The transport remains connected
until Chrome disconnects or Utomator exits, and other active runs may share it.
Without an explicit `UTOMATOR_BROWSER_MODE=attached` opt-in, no CDP discovery is
attempted. Sharing an entire browser profile is powerful: use a dedicated Chrome
profile with limited permissions, never a remote worker or public CDP port.
