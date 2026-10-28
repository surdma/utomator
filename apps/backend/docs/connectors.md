# LinkedIn-only connector: current implementation and limits

This document supersedes the historical multi-provider dialog description below. The current dialog displays LinkedIn only. It can register an /in/ profile URL, connect through a locally visible server-owned Chrome window, verify ownership, select a specific account, or disconnect it. The saved account directory, workspace and profile views consume the same backend connector state.

**Session storage:** The database stores tenant-scoped account and verification metadata; it does NOT store browser cookies. LinkedIn website login remains in an isolated, server-side Chrome profile under a private durable tenant directory. Backend credentials and cookies are never returned to a mobile phone or copied to the local browser. Cross-device access requires the same authenticated Utomator tenant and the same persistent server storage. Lost or ephemeral storage cannot be reconstructed from a database verification timestamp.

**Validation:** Every LinkedIn browser workflow now opens its account-specific profile and verifies a real owner-only LinkedIn control before executing steps. If a provider session was revoked, the run is blocked, the verification record is expired and the Session node emits a failure event. Other failed workflow stages also emit targeted failure events for a red artboard border. Network outages do not alone prove an expired login.

**Hosted limitation:** HEADLESS=true prevents new interactive LinkedIn browser sign-in because no safe remote interactive browser handoff currently exists. The UI can authorize approved LinkedIn publishing through separate, encrypted OAuth access when developer credentials are configured; this grants only the supported API operations, not browser profile editing, invitations, messages or general future workflows. LinkedIn may expire or revoke both kinds of authorization at any time. A fully remote mobile browser sign-in and unrestricted persistent LinkedIn access are NOT implemented.

**Lifecycle:** Disconnect deletes the private browser profile and connector record. Removing or changing an account's provider identity also invalidates its old connection (and, where configured, its OAuth grant). The server is authoritative, not localStorage. All clients must be authenticated to their own Utomator tenant. Do not export/import social-network cookies or bypass MFA.

**Validation gates:** browser session mock tests, run preflight tests, profile/workspace state checks, CI and mobile connector UI tests. Live LinkedIn sign-in requires authorized real credentials and an interactive host and cannot be inferred from mocks.

---

## Historical connector implementation notes (superseded for current UI)

# Social connector onboarding (local Utomator)

The account directory stores labels and profile URLs. These are **not** authenticated connections.

The workspace uses `GET /connectors`, `POST /connectors/:id/connect`,
`POST /connectors/:id/sync`, and `POST /connectors/:id/disconnect`.
Session status is recorded separately from account profile metadata.
See `social-connector-authentication-runbook.md` for the full operational
and testing guide.

## Browser-session connectors (restored scope)

Two networks use the conduct-based browser-session connector: **LinkedIn**
and **X**. For both:

1. Choose a saved profile and press **Connect** — the modal opens a dedicated
   Chrome sign-in window (isolated per account UUID under
   `.runtime/chrome/accounts/`) and shows the tracked progress rail.
2. Sign in on the provider itself, including any MFA prompts. No credentials
   are sent to Utomator.
3. Press **Sync**. Verification checks that the owned profile exposes the
   owner-only control — **“Edit intro”** on LinkedIn, **“Edit profile”** on X
   (`getByRole('link', { name: /edit profile/i })` for X). A saved profile URL
   alone is insufficient.
4. A successful sync stores a verification timestamp and answers with
   `status: 'connected'`. If Sync finds sign-in or MFA incomplete it answers
   `reconnect-required`, keeps the window open, and audits the attempt: the
   owner finishes signing in and syncs again. A transient network failure
   answers `temporarily-unavailable` and preserves the existing verification.
5. A workflow supplies `accountId` and its exact matching profile URL. The
   backend rejects an unverified connection or a mismatch with HTTP 400.
   Expired/failed authentication during a run calls `expire()`, invalidates
   the saved verification (audited as `connection-expired`) and requires
   reconnecting — not credential entry inside the run.

The connector dialog (`Connect your social accounts`) shows each provider in
its own section with exactly one context-aware primary action:

| Saved profile state                    | Primary action | Extra affordances |
| -------------------------------------- | -------------- | ----------------- |
| disconnected                           | Connect        | launches the isolated window |
| sign-in window open                    | Sync           | “Open sign-in window”, progress rail, 6-second re-poll |
| connected, verified < 24 h ago         | Disconnect     | two-step inline confirm, “Use in workspace” |
| connected but verified ≥ 24 h ago      | Sync           | “Session may have expired” pill, secondary Disconnect |
| API-only network                       | Connect (API required), disabled | explanation note |

In-flight commands are cancellable (“Cancel” / “Stop tracking”); the frontend
aborts its request after 120 s and reports “timed out or was cancelled” while
the engine-side window remains open. Failures surface as `role="alert"`
banners with **Try again**; successes as `role="status"` banners.

X is restored for browser sessions since the “Edit profile” verification
recipe is deterministic; the modal offers it exactly like LinkedIn.

Browser session directories may contain sensitive cookies and must never be committed,
published, or synchronized with external storage. Disconnect removes the directory.
The browser retains whatever sessions the provider permits and may expire them at any time.
A verification timestamp is **not** a permanent guarantee of access.

## Provider capability limits

This is not an OAuth token-to-cookie converter. Provider OAuth is an API authorization
protocol and **cannot automatically sign a browser into the provider's website**.

Browser-session support is limited to the connectors in the capability matrix
above. For Instagram, GitHub and Dev.to, the directory supports reference records
and the connector displays the disabled **Connect (API required)** primary with
“Official API connector required” notes. These networks must use approved
developer credentials, authorized OAuth scopes and provider-compliant API
operations before being marked ready for workflows. No fake connection/synchronization
state is used.

Every state change (`sign-in-opened`, `session-verified`, `reconnect-required`,
`temporarily-unavailable`, `connection-expired`, `disconnected`) is appended to
an audit trail in the document store (`connectors` namespace, `audit` key,
capped at 200 entries); audit failures never block state changes.

## Memory and Observer

Chat-origin memory captures the exact text of new user messages, not AI-inferred facts.
Messages mentioning credential keywords are rejected from persistence.
Browser-origin Observer entries summarize existing audit journals, retaining their run ID.
Both views share an Intelligence screen but keep separate provenance. No LLM is currently
connected; automatic semantic extraction and profile updates are not claimed.
