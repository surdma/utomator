# Utomator

Local-first, repeatable Playwright automation for a LinkedIn or X account you control. Fastify 5,
TypeScript, Node 22+, pnpm, Biome, and Chrome. The dashboard is served by the frontend at
/dashboard/pipeline, with a loopback Fastify API. The dashboard streams every workflow through a
persistent Server-Sent Events connection. No language-model service or AI API is required at
runtime.

## LinkedIn growth scope

The full LinkedIn growth, research, professional branding, audience, career, company, outreach, and
analytics capability map lives in
[docs/linkedin-growth-capability-map.md](docs/linkedin-growth-capability-map.md). Open `/growth` to
explore the 15 capability modules, target profile sections, goal-oriented journeys, implemented
subsets, and missing provider prerequisites. This page is a **planning and navigation catalog**; no
planned LinkedIn operation runs merely because it is listed.

The detailed design-only workflow templates remain in
[docs/linkedin-workflow-implementation-plan.md](docs/linkedin-workflow-implementation-plan.md);
current code and tests determine what is actually executable.

## Start

From the workspace root after migration:

```bash
corepack enable
pnpm install
pnpm --filter @utomator/backend exec playwright install chrome
pnpm dev:automate
```

Open http://127.0.0.1:3000/dashboard/pipeline. The runner first checks for an **already-running
local Chrome debugging session** on `http://127.0.0.1:9222`. When available, Playwright attaches to
that Chrome's default context, opens a new automation tab, and shares the session cookies already
stored in the connected Chrome profile. Existing tabs are not navigated or closed by Utomator. When
the debugging endpoint is unavailable, the runner uses the dedicated persistent profile in
`apps/backend/.runtime/chrome/{platform}` instead, reusing its own logins across runs.

### Reuse a signed-in browser session

Chrome must expose a local DevTools Protocol (CDP) endpoint **before** Playwright can attach. An
ordinary already-open Chrome window without debugging enabled cannot be attached automatically.
Chrome 136 and newer also require a non-default user-data directory for remote debugging, so
pointing Chrome at your everyday default profile is unsupported.

Start a persistent Chrome debugging profile, then sign in once to LinkedIn or X in that window.
Example for macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.utomator-connected-chrome"
```

Keep that Chrome open while running Utomator. A subsequent run joins the same profile and reuses its
authentication; closing an automation tab or ending a run does not close the connected Chrome
process. You can check that Chrome exposes CDP locally by visiting
`http://127.0.0.1:9222/json/version` on your own machine.

For a different local port, set `CHROME_CDP_URL=http://127.0.0.1:9333` in the environment of the
Utomator process (the example file does not automatically load variables). Configured endpoints must
be loopback URLs; connection failures are reported instead of silently opening another browser.
Never bind CDP to a public or LAN interface. Anyone with CDP access can control browser tabs and
access authenticated sessions. Use a separate debugging profile, not your personal default Chrome
data directory.

If neither a debugging endpoint nor an existing Utomator-managed profile is available, manually sign
in on the first run. Any provider MFA or identity verification remains a manual step.

Each run is serialized so two workflows cannot edit the same browser at the same time.
`GET /events/:id` is an SSE stream with event IDs, reconnect replay, and heartbeat. The dashboard
uses local `POST /runs` for commands , `POST /runs/:id/decision` for human approval, and
`POST /runs/:id/input` for typed answers, because SSE is server-to-client only.

## Studio interaction layout

The workflow artboard uses the full center workspace. Node inputs and configuration open a centered
**Workflow configuration** dialog; non-action nodes display their own recorded stage information.
Selecting **Verification** or **Final output** opens a read-only result gallery with real workflow
event messages, observed DOM data, and saved browser screenshots. Successful mutating runs attempt
an additional `run-final-state.png` screenshot _after their read-back verification_. If capture
fails, the engine reports that failure without misrepresenting the mutation result.

The right panel is reserved for **Mator**. Tracking and audit telemetry open in a separate centered
dialog. Minimizing chat reclaims the sidebar column for the artboard, and the floating **Mator**
button restores it.

Clicking a captured image directly opens the **Image annotation studio**, not a raw image in a new
tab. The editor supports circle/ellipse, rectangle, and freehand marks, undo/removal, an action type
per marked region, and an optional region-specific comment. The redundant "Add annotated region"
text form is gone. The **Tag to Chat & Workflow** action archives the source image and annotations
with normalized image-relative coordinates, and saves an audit-friendly `*.yaml` document alongside
the review record. The YAML endpoint is `GET /visual-reviews/:id/yaml`; access remains scoped to the
local owner process. Saved images can be reopened to create a new annotated version without
overwriting the original.

Each tagged review inserts an **Image annotation** bridge node into the appropriate visible workflow
graph, between live inspection and the next executable step. It links the image and its YAML-backed
actions to Mator. This is an operator-authored instruction plan, **not** a DOM selector and **not**
an automatically executed browser click; current Mator has no connected AI model. Any actual website
mutation still requires a supported action, real browser inspection, and human approval. The YAML
includes `browserActionsExecuted: false` to prevent incorrect audit claims.

Short status/error messages stay inline near their affected controls; graph context menus remain
anchored popovers. Non-blocking dialogs support Escape and backdrop dismissal; approval checkpoints
remain blocking until the operator responds or cancels.

## Executable workflow editor

Utomator now keeps **Start / Pause / Resume / Stop** in the artboard toolbar, not inside an
individual node's configuration dialog. **Templates** opens a dialog of supported LinkedIn and X
actions, including X post creation, pinning, deletion, and profile updates. The **Quit / stop**
preset inserts an actual stop step before the browser action; it does not publish or mutate
anything.

The workflow editor and Fastify runner share a strictly validated **linear execution plan**. The
plan must retain `start → session → action → finish` in that order, with optional nodes inserted
between these required stages. The interface supports editable node titles and types, event
messages, inspection steps, bounded delays, operator breakpoints, and early-stop nodes. Optional
nodes can be added, removed, moved, and reconnected. Reconnecting an edge moves its optional target
immediately after the source; cycles, unconnected nodes, arbitrary branching/merging, and removal of
essential stages are rejected. This is deliberate: arbitrary edges cannot bypass Playwright
ownership checks, human approval, or result verification embedded in supported action handlers.

**Start** runs the edited plan using `POST /runs` with a validated `workflow` definition, whether or
not the draft was previously saved. **Save workflow** persists the validated graph and nonsecret
action fields as a local JSON file under `.runtime/workflow-plans/`. Reopening the same
platform/action reloads that configuration. One backend action is supported per plan; custom steps
execute sequentially around it, rather than pretending to implement unsupported platform operations.

- `GET /workflow-templates/:platform` — generated template definitions.
- `GET /workflow-plans/:platform/:action` — saved plan or safe default.
- `PUT /workflow-plans/:platform/:action` — validate and persist the plan.
- `POST /runs/:id/pause` — request pause at the **next safe stage boundary**.
- `POST /runs/:id/resume` — continue an operator-paused run.
- `POST /runs/:id/cancel` — abort an active run.
- `GET /runs/:id/logs` — access bounded persisted run journal entries while the run belongs to the
  current local service process.

The built-in pause stage remains stopped until Resume. External Pause requests cannot interrupt a
third-party website click or an in-flight approval. A Pause request during the action takes effect
at the next stage boundary; Stop requests cancel the run using the runner's AbortSignal. Step
start/completion, inspection observation, manual note, pause, resume, and error information is
written to the same `.runtime/runs/*.jsonl` journal consumed by the UI.

## Versioned YAML step snapshots (first execution slice)

The validated graph now compiles to an **allowlisted YAML execution snapshot** at the beginning of
each run. The runner dispatches the compiled step operation (`observe-page`,
`execute-approved-action`, `record-event`, `delay`, `await-operator`, `end-run`, or the protected
lifecycle operations). It does not execute arbitrary code, shell commands, or selectors embedded in
YAML. Existing Playwright handlers continue to enforce account ownership, authentication, user
approval and read-back verification.

Every run using an explicit workflow creates a frozen manifest and one YAML document per step in
`.runtime/runs/<run-id>/`. Step YAML includes input/output **contracts**, the next node, bounded
configuration and mandatory policy metadata. It is compiled from the schema-validated plan; it is
**not** a parser for arbitrary user YAML, and neither the root browser-snapshot YAML files nor
LLM-authored YAML are executable. The current JSON plan remains the editable persistence format. The
YAML compiler and current runner form a safe incremental migration, not a fully dynamic
cross-platform scheduler.

- `GET /workflow-plans/:platform/:action/yaml` — currently saved workflow manifest.
- `GET /workflow-plans/:platform/:action/steps/:stepId/yaml` — one saved step definition.
- `GET /runs/:id/workflow.yaml` — exact frozen run manifest (current service process).
- `GET /runs/:id/steps/:stepId.yaml` — exact YAML executed at that run step.

The editor exposes **View this step’s validated YAML** for saved nodes. When a graph has unsaved
changes it must be saved before that link can represent the latest configuration. The run snapshot
is separate from editable plans so later edits cannot rewrite a historical execution definition.

A multi-action graph, input/output value binding, full YAML import/editing, Instagram adapter,
scheduled queue, cross-platform posting or autonomous LLM operations **are not implemented**. See
`docs/yaml-first-social-workflows.md` for the staged architecture and provider capability
boundaries.

## Available workflows

| Platform | Workflow                 | What it does                                                                                          |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| LinkedIn | Audit                    | Read current visible headline/profile text, save evidence screenshot                                  |
| LinkedIn | Edit profile             | Fill headline and/or About, verify before Save, require approval, reload and verify                   |
| LinkedIn | Add skill                | Resolve an exact LinkedIn skill, require approval, verify on skills page                              |
| LinkedIn | Edit existing experience | Edit description by existing position ID; optional owner-confirmed start date, reload form and verify |
| LinkedIn | Edit contact website     | Add/update a selected website row, optional website type, reload form and verify                      |
| LinkedIn | Edit services            | Modify only the services description; existing categories remain untouched                            |
| LinkedIn | Add project              | Create project with optional media link; verify new entry                                             |
| LinkedIn | Add Featured link        | Add link, set title, verify Featured page                                                             |
| X        | Audit                    | Read username/bio/profile page and capture evidence                                                   |
| X        | Edit profile             | Fill explicitly provided bio/location/website, verify, approve, reload                                |
| X        | Upload banner            | Choose a local image under `apps/backend/assets`, approve crop and Save, verify changed banner        |
| X        | Compose post             | Confirm exact text, pause before publishing, verify appearance on profile                             |
| X        | Pin post                 | Open an exact post URL, require approval, verify pinned status                                        |
| X        | Delete post              | Open an exact post URL, require **two** approvals, verify disappearance                               |

No bulk deletion, retweet sweep, auto-following, invitations, DMs, engagement farming, or challenge
bypass. The historical browser interactions are evidence, not a license to replay every action
automatically. Some feature selectors, including LinkedIn Featured title and X banner crop, still
require live UI verification and may correctly stop as ambiguous. The workflows above may require
selector updates after LinkedIn/X redesigns; a selector mismatch is a failure, not a successful
action.

## Local checks

```bash
pnpm --filter @utomator/backend test
pnpm --filter @utomator/backend exec playwright install chromium
pnpm --filter @utomator/backend test:integration
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend lint
pnpm --filter @utomator/backend build
```

## Security and limitations

- Binds to `127.0.0.1` only. There is no remote authentication layer; **never reverse-proxy it
  publicly**.
- Browser sessions, cookies, and screenshots stay in gitignored `.runtime/`. Do not commit them.
- One process, one active run, in-memory event journal (last 1,000 events) and run list (last 100).
  Restarting the app clears live-run history.
- No Postgres/Redis required for a single local operator. Before adding multiple users, remote
  access, durable scheduling, or background workers, implement identity-bound Postgres persistence,
  Redis-backed job ownership, and authorization for stream/control endpoints. An in-memory queue
  cannot safely handle multiple replicas.
- Account ownership is checked using account-specific edit affordances. Never assume a public
  profile URL implies edit permission.
- All writes require operator approval, and success requires a fresh read. Unverified actions fail
  loudly. Take platform policies and human review seriously.
- Screenshots and YAML-format ARIA accessibility snapshots are stored under
  `.runtime/evidence/<runId>/`, while SSE events are also saved as `.runtime/runs/<runId>.jsonl`.
  PNGs are available only through allowlisted loopback routes after their run/file pair was
  registered by a real capture event; YAML and run journals are never served.

## Owner profile context and optional sign-in

The local dashboard reads live professional context from
`apps/backend/data/seed-profile/lib/data.ts`, `lib/resume-data.ts`, `lib/about-profile.ts`,
`lib/about-evidence.ts` and their evidence ledgers via a read-only TypeScript AST parser. It
includes the biography, contact details, jobs, degrees, qualifications, skill taxonomy, projects,
claims and evidence boundaries; non-literal imports are not evaluated or invented. Context is shown
locally and never inserted into social profiles automatically.

Enter only your LinkedIn public profile handle or X handle, not a full URL. Utomator validates the
handle and constructs the official HTTPS profile URL. The existing full-URL API remains backward
compatible.

Authentication first reuses an existing local CDP Chrome session when available; otherwise it uses
Utomator's own persistent Chrome profile. You may opt into one-time sign-in with a username/email
and password for a single run; these are **not persisted or streamed**, are redacted from
browser-event logs, and are cleared after use. Unrecognized login steps, multifactor authentication
and security challenges always require manual action in Chrome. This is a local-only convenience,
not a hosted credentials manager. Never expose the dashboard or Chrome CDP to a public interface.

## Architecture and lifecycle

Start both processes with `pnpm dev:automate` at the workspace root. The frontend serves
`http://127.0.0.1:3000/dashboard/pipeline`, forwarding only allowlisted API and SSE endpoints to
Fastify on 127.0.0.1:3101. Standalone Fastify starts with `pnpm --filter @utomator/backend dev`, but
does not serve the UI. `src/main.ts` exports the testable Fastify factory, while `src/server.ts` is
the unconditional executable that listens even when a shell inherited NODE_ENV=test.
`pnpm ... start` uses dist/server.js.

The chat is a **deterministic command interpreter, not an AI model**. It stages
audit/headline/skill/post drafts and never publishes a change from chat input alone. The
source-backed playbook reads the reviewed LinkedIn guide and inventories root YAML/PNG/Playwright
captures as **historical evidence**, not live state. Coverage indicators mean a handler exists, not
that external providers have been dogfooded.

The frontend operator page is deliberately disabled for non-loopback hosts. Never expose the Next
development server or Fastify remotely with the automation API enabled. Use a local browser only. If
a real profile selector changed, the workflow stops rather than guessing.

### Login redirect and browser lifetime

Playwright checks for delayed login redirects and visible login forms after navigation, not just the
URL returned by the first document. If a provider requires authentication, the current run enters an
approval checkpoint and keeps the browser open for manual login and MFA (the checkpoint timeout is
10 minutes). Approve **after** successfully signing in; the runner reloads the requested official
profile and verifies that the authwall is gone. Reject or cancel to end the run and close its
browser context. An abandoned or repeatedly unsuccessful authentication attempt eventually blocks
rather than running against a login screen. One-time credentials are cleared from the in-memory run;
login screens must not be captured as evidence.

## Connected visual reviews, page scopes and identity memory

The Utomator operator studio at `/dashboard/pipeline` binds the chat and React Flow artboard through
a selected node, social account, and page scope. You can attach a PNG/JPEG/WebP image (2 MiB
maximum) or annotate an actual Playwright PNG capture. Drag to mark up to 15 normalized regions,
describe intended changes, and save the review. Each review is stored locally in
`apps/backend/.runtime/visual/` with the source image copied into an immutable review file. Capture
provenance retains the originating run ID. Review images remain accessible after the runner process
restarts; no server filesystem path is exposed to the browser.

A review offers **Inspect this exact page** and **Configure a supported action**. Inspection runs a
real, read-only `audit-page` workflow through Fastify/Playwright, limited to the exact selected
LinkedIn profile or its existing Experience, Skills, Projects and Featured detail pages, or the
exact selected X profile. An annotation's coordinates are **not verified selectors**, so they cannot
be replayed as clicks or generate new browser actions. Supported editing workflows still require
exact field values and individual owner approval; no AI service is connected. Arbitrary websites and
bulk cross-page modifications are not supported.

The Profile page exposes source-backed identity from the reviewed seed snapshot plus owner-written
memory notes and a timeline of actual browser audit observations extracted from
`.runtime/runs/*.jsonl`. Observed titles, headlines and bios are not treated as verified résumé
claims. Notes and visual reviews persist as local JSON and binary evidence in `.runtime` and are
deliberately not committed to Git. This is a **single-owner local storage design**, not a multi-user
production database, embedding model, or autonomous long-term memory engine. Local files must be
protected/backed up by the owner, and cannot be inferred from the network after deletion or when the
application is hosted remotely.

API surface: `GET/POST /visual-reviews`, `GET /visual-reviews/:id/image`,
`GET/POST /identity-memory`, `GET /identity-timeline`, and `POST /runs` with `action=audit-page`
plus a validated `pageUrl`. The frontend proxies only these allowlisted paths from loopback.
One-time credentials are never accepted into review or memory records by the UI.

## Craft persistence and tenant boundaries

The former file-backed Skill library has been replaced by database-backed Crafts. Six immutable
built-in MDX definitions are seeded from `crafts/default/*.mdx` into each account's database
namespace. The defaults can be viewed and cloned, never updated or deleted via user API operations.
Personal drafts and clones are scoped by the authenticated tenant owner in the document store and
support MDX/graph round-trips. The hosted worker uses a code-relative path for bundled defaults so
its private working directory does not affect startup. Portable exports still contain `SKILL.md` for
agent compatibility.
