# Utomator

Utomator is a local-first, human-controlled browser automation studio. This repository is the application's home, with a Next.js frontend and Fastify/TypeScript backend in one pnpm workspace.

## Workspace

```text
apps/
  frontend/  Next.js landing page, operator studio, growth, editorial, research, profile, resumes, skills, settings
  backend/   Fastify API, browser runner, account and career stores, connectors, tests and Drizzle schemas
```

The application was migrated from `surdma/devsurma-frontend` branch `utopia` at `afd9000a197d16ed20606a90d4f9ce6d416bed28`. Source PR #20 is not modified. The standalone backend previously at the root of this repository is superseded on the migration branch; the destination's `main` is not changed until an explicit merge.

The old personal portfolio's About, Projects, Articles, and public Resume routes are **not** hosted here. The original home design is retained with Utomator product copy. Operator routes now live directly below the frontend app root:

- `/`: product landing page
- `/workspace`: automation canvas and chat
- `/growth`, `/editorial`, `/research`: LinkedIn workflow surfaces
- `/library`, `/history`: skills and run history
- `/profile`, `/resumes`, `/observer`, `/memory`, `/settings`: owner tools
- `/api/*`: restricted Next.js proxy for the local Fastify API, including SSE

The operator UI and proxy enforce their existing local-only access and allowlist restrictions. Do not make the frontend or backend publicly accessible without adding a proper authenticated, owner-bound security model. The product landing page is not a remote-control dashboard.

## Run locally

Requires Node.js 22+, pnpm 10, and a local browser. From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @utomator/backend exec playwright install chromium
pnpm dev:automate
```

Open `http://127.0.0.1:3000`; the Fastify API listens on `127.0.0.1:3101`.

To run separately: `pnpm dev:frontend` and `pnpm dev:backend`. The combined command performs local SQLite schema preflight when no PostgreSQL DATABASE_URL is configured.

## Verify

```bash
pnpm test:frontend
pnpm test:backend
pnpm --filter @utomator/backend test:hosted
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend lint
pnpm --filter @utomator/backend build
pnpm --filter @utomator/frontend typecheck
pnpm --filter @utomator/frontend build
```

The browser integration suite uses local deterministic fixtures, not actual LinkedIn/X account actions.

## Data provenance and boundaries

Existing backend code consumed professional profile declarations from the portfolio source tree. A reviewed snapshot of the specific declarations and evidence documents remains under `apps/backend/data/seed-profile` so account/career initialization is not coupled to removed portfolio routes. The backend's existing response shape remains compatible with its consumers. Editable owner data lives in its local runtime store.

Historical `.playwright-cli` browser captures and other personal portfolio files remain in the original repository rather than becoming product frontend assets. If that archive is unavailable locally, the playbook reports no archived files instead of crashing. These historical artifacts are not executable production workflows.

Do not commit local cookies, credentials, OAuth secrets or `.runtime` contents. Consult `apps/backend/.env.example` and `apps/backend/README.md` for provider configuration, safety checkpoints and documented capability limits.
