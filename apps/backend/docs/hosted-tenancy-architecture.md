# Hosted Utomator: authenticated single-node deployment

**Security model:** The existing local edition stays loopback-only. The new
\`apps/backend/hosted/server.mjs\` is the only authorized public entry point.
It uses OpenID Connect (OIDC) Authorization Code with PKCE, validates provider
RS256 ID-token signatures against the trusted issuer's HTTPS JWKS, validates
issuer, audience, nonce, expiry and issued-at, and issues short-lived
HttpOnly Secure SameSite=Lax sessions. Sign-out revokes the server session.
A gateway restart invalidates all sessions; users sign in again.

The gateway maps verified OIDC issuer+subject to a stable opaque UUID using
\`HOSTED_OWNER_KEY\`. **Never** accept this ID from the client. Each user gets
one isolated Fastify child process and working directory. That process has
its own account, career, connector, workflow, run, event, image, skills,
identity-memory, Chrome profile and SQLite files. Per-owner browser processes
run headless without CDP reuse. Every request to \`/workspace\` pages and every
\`/api/*\` endpoint (including SSE) is authorized at the gateway
before any worker receives it. Mutations require the exact configured HTTPS
Origin. Cross-owner resource IDs never reach another owner's process.

## Setup: one Linux host, HTTPS ingress and OIDC provider

1. Install workspace dependencies, build \`@utomator/backend\` and
   \`@utomator/frontend\`, and install Playwright Chromium.
2. Configure an OIDC application at a trusted provider. Set the exact HTTPS
   redirect URI to \`https://automation.example.com/auth/callback\`.
   The OIDC provider must issue **RS256-signed** ID tokens and publish a
   discovery document and JWKS. MFA and user provisioning are owned by the
   provider. An external social-network login is not an app login.
3. Use the settings in \`.env.hosted.example\`. Generate two different random,
   high-entropy secrets. Persist and back up \`HOSTED_OWNER_KEY\` securely;
   changing it changes tenant identity and makes existing data inaccessible.
   \`HOSTED_SESSION_SECRET\` may be rotated, invalidating existing sessions.
4. Start Next.js **bound exclusively to 127.0.0.1:3000**, with the workspace
   and assets available on the same machine. Start the gateway with
   \`pnpm --filter @utomator/backend start:hosted\`. Do not publish Next's
   port or any Fastify worker port. Fastify workers are spawned on ephemeral
   loopback ports automatically. The gateway itself binds loopback on
   \`HOSTED_PORT\` (default 3200).
5. Configure Nginx/Caddy/another audited TLS ingress for
   \`automation.example.com\` to **proxy all paths to the gateway on 127.0.0.1:3200**.
   Preserve the original public Host header and disable intermediary buffering
   for SSE endpoints. Forward the canonical HTTPS Origin unchanged. Never
   expose Chrome CDP or the tenant storage tree. The gateway rejects any
   Host header other than the configured redirect URI host.
6. Mount \`HOSTED_TENANT_ROOT\` on durable encrypted storage, owned only by
   the gateway's OS service account, with private file/directory permissions.
   Back up and restore complete per-user directories. The workers initialize
   their existing Drizzle document table on first use; new schema revisions
   require an explicit migration and rehearsal.

For production, set all of:
- \`OIDC_ISSUER\`, \`OIDC_CLIENT_ID\`, and (when the provider requires it)
  \`OIDC_CLIENT_SECRET\`
- \`OIDC_REDIRECT_URI\` as the public HTTPS callback URL
- \`HOSTED_SESSION_SECRET\` and separately \`HOSTED_OWNER_KEY\` (each at least
  32 bytes; store using secret management)
- \`HOSTED_TENANT_ROOT\` as a private **absolute** Linux directory
- \`NEXT_LOCAL_ORIGIN=http://127.0.0.1:3000\` and \`HOSTED_PORT=3200\`

Hosted mode fails startup on missing configuration or invalid/unavailable
OIDC discovery. A failed OAuth signature, nonce, issuer, audience, state or
PKCE exchange fails closed. Anonymous API calls return 401; anonymous
workspace page requests redirect to sign-in. Login and callback calls have
bounded in-memory rate limits.

## Compatibility and isolation details

- The public portfolio's existing content remains publicly readable.
  Hosted \`/workspace\` pages are rendered by the unchanged local Next app
  behind the authenticated gateway; client API calls are intercepted and
  forwarded directly to the signed-in user's Fastify worker, rather than
  Next's original local-owner API proxy.
- The original desktop/local mode is unchanged. Local-account JSON is **not**
  automatically imported into a new hosted user's profile. Import must be
  opt-in and bound to the verified rightful owner.
- Each worker receives a trusted internal owner ID, keeps SQLite under its
  own private directory and uses that owner ID for database rows. Shared
  \`process.cwd()\`-based paths are isolated by separate operating-system
  processes, not by changing the working directory of a shared Node server.
  Each user has independent browser, memory, approval, run and evidence stores.
- Each child Fastify worker also requires a random, process-specific internal
  authentication credential on **every** request, including health, screenshots,
  SSE, and run approvals. The credential is generated by the gateway and never
  accepted from incoming browser headers. Unauthenticated direct loopback
  requests return 401. IPC parent-liveness termination stops workers (and
  browser subprocess groups) after abrupt gateway loss.
- Directly exposing the legacy Fastify API or the Next process externally
  would defeat this architecture. Gateway-only HTTPS ingress is mandatory.
- The gateway forwards mutating requests only with a valid authenticated
  session and exact Origin; it does not forward client credentials or owner
  headers to a worker. It routes SSE and checkpoint decisions to the same
  user-owned worker as the associated run.
- Logout invalidates the signed session and stops that user's worker,
  including in-progress browser activity; persisted records survive.
  A gateway restart expires all sessions. Workers are recreated on demand
  and run archives are loaded from their own storage.

## Current deployment limitations and next gates

**Remote interactive social sign-in is a release blocker.** Current connectors
expect an operator to use a local Chrome tab for LinkedIn login and MFA, whereas
hosted workers launch headless browsers with no shared Chrome/CDP attachment.
The hosted gateway does not yet supply a secure, user-specific interactive
browser viewer or an approved local companion for completing provider challenges.
Do **not** advertise hosted social-account connection/editing as production
ready or grant unrestricted access until that path is implemented and dogfooded.


This is a **single-node hosted edition**, not a horizontally scalable SaaS
release. \`HOSTED_MAX_WORKERS\` bounds concurrent Chrome workers; there is no
durable Redis queue or cross-node lease yet. Do not place multiple gateway
replicas behind a load balancer without an identity-aware worker router and
distributed locks. Users can run only one active automation per personal
worker; request concurrency within one user remains subject to existing run
approval and action constraints. Protect the OS service account and disks:
process isolation is application-level, **not** container/VM isolation against
malicious native code. Provider policies and manual MFA still apply.

Before an unrestricted public launch, independently review the TLS proxy,
cookie/session settings, OAuth provider configuration, OIDC key rotation,
reverse-proxy path encoding, session termination, outbound Chrome networking,
backup/restore, storage quotas, worker crash recovery, audit logs, secret
rotation and abuse controls. Run real two-account dogfood with sign-in, MFA,
browser sessions, screenshots, run approvals and cross-user guesses. The
existing GitGuardian and Vercel checks on PR #20 remain separate release
blockers until remediated.

## Verification

Run \`pnpm --filter @utomator/backend test\` for existing regression
coverage and \`pnpm --filter @utomator/backend test:hosted\` **after building**
for OIDC, reverse-proxy and live per-owner Fastify worker tests. Production
browser/login dogfood requires a configured HTTPS OIDC provider and a running
TLS ingress and must not be reported as passed without those prerequisites.
