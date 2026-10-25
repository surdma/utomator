# Utomator

Local-first, repeatable Playwright automation for a LinkedIn or X account you control. Fastify 5, TypeScript, Node 22+, pnpm, Biome, and Chrome. The dashboard streams every workflow through a persistent Server-Sent Events connection. No language-model service or AI API is required at runtime.

## Start

From the workspace root after migration:

```bash
corepack enable
pnpm install
pnpm --filter @devsurma/utomator exec playwright install chrome
pnpm dev:utomator
```

Open http://127.0.0.1:3101. The default browser mode opens a dedicated persistent Chrome profile under `utomator/.runtime/chrome/{platform}`. Log in manually on the first run; the app never asks for your password. A browser challenge stops the flow and requests your intervention.

Alternatively start Chrome with a **separate** debugging profile, then set `CHROME_CDP_URL=http://127.0.0.1:9222` in `.env` (load environment variables using your shell). Don't expose the debugging port outside loopback. Chrome CDP must not use your everyday default profile.

Each run is serialized so two workflows cannot edit the same browser at the same time. `GET /events/:id` is an SSE stream with event IDs, reconnect replay, and heartbeat. The dashboard uses local `POST /runs` for commands , `POST /runs/:id/decision` for human approval, and `POST /runs/:id/input` for typed answers, because SSE is server-to-client only.

## Available workflows

| Platform | Workflow | What it does |
|---|---|---|
| LinkedIn | Audit | Read current visible headline/profile text, save evidence screenshot |
| LinkedIn | Edit profile | Fill headline and/or About, verify before Save, require approval, reload and verify |
| LinkedIn | Add skill | Resolve an exact LinkedIn skill, require approval, verify on skills page |
| LinkedIn | Edit existing experience | Edit description by existing position ID; optional owner-confirmed start date, reload form and verify |
| LinkedIn | Edit contact website | Add/update a selected website row, optional website type, reload form and verify |
| LinkedIn | Edit services | Modify only the services description; existing categories remain untouched |
| LinkedIn | Add project | Create project with optional media link; verify new entry |
| LinkedIn | Add Featured link | Add link, set title, verify Featured page |
| X | Audit | Read username/bio/profile page and capture evidence |
| X | Edit profile | Fill explicitly provided bio/location/website, verify, approve, reload |
| X | Upload banner | Choose a local image under `utomator/assets`, approve crop and Save, verify changed banner |
| X | Compose post | Confirm exact text, pause before publishing, verify appearance on profile |
| X | Pin post | Open an exact post URL, require approval, verify pinned status |
| X | Delete post | Open an exact post URL, require **two** approvals, verify disappearance |

No bulk deletion, retweet sweep, auto-following, invitations, DMs, engagement farming, or challenge bypass. The historical browser interactions are evidence, not a license to replay every action automatically. Some feature selectors, including LinkedIn Featured title and X banner crop, still require live UI verification and may correctly stop as ambiguous. The workflows above may require selector updates after LinkedIn/X redesigns; a selector mismatch is a failure, not a successful action.

## Local checks

```bash
pnpm --filter @devsurma/utomator test
pnpm --filter @devsurma/utomator typecheck
pnpm --filter @devsurma/utomator lint
pnpm --filter @devsurma/utomator build
```

## Security and limitations

- Binds to `127.0.0.1` only. There is no remote authentication layer; **never reverse-proxy it publicly**.
- Browser sessions, cookies, and screenshots stay in gitignored `.runtime/`. Do not commit them.
- One process, one active run, in-memory event journal (last 1,000 events) and run list (last 100). Restarting the app clears live-run history.
- No Postgres/Redis required for a single local operator. Before adding multiple users, remote access, durable scheduling, or background workers, implement identity-bound Postgres persistence, Redis-backed job ownership, and authorization for stream/control endpoints. An in-memory queue cannot safely handle multiple replicas.
- Account ownership is checked using account-specific edit affordances. Never assume a public profile URL implies edit permission.
- All writes require operator approval, and success requires a fresh read. Unverified actions fail loudly. Take platform policies and human review seriously.
- Screenshots and YAML-format ARIA accessibility snapshots are stored under `.runtime/evidence/<runId>/`, while SSE events are also saved as `.runtime/runs/<runId>.jsonl`. None have public HTTP routes.
