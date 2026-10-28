# Utomator
Local-first social automation with an operator-controlled frontend and a Fastify + Playwright backend. This repository is the canonical Utomator workspace, migrated from `surdma/devsurma-frontend` branch `utopia` at `afd9000a197d16ed20606a90d4f9ce6d416bed28`.

## Workspace
- `apps/frontend`: Next.js application, product landing page and operator pages.
- `apps/backend`: Fastify API, Playwright runner, persistence, hosted workers, tests and backend-owned account context.

The two applications are declared in `package.json` as npm workspaces. pnpm 10 remains the pinned install and execution tool so the existing lockfile and CI are reproducible.

## Quick start
Use Node.js 22+ and pnpm 10.

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/backend/.env.example apps/backend/.env
pnpm dev
```

Open `http://127.0.0.1:3000` for the landing page and `http://127.0.0.1:3000/dashboard` for the local operator dashboard. The backend listens on `127.0.0.1:3101`; the Next.js `/api/*` proxy permits only supported operations.

## Routes
- `/`: Utomator product homepage.
- `/dashboard`: automation workspace.
- `/editorial`, `/growth`, `/research`, `/history`, `/crafts`, `/profile`, `/resumes`, `/observer`, `/memory`, `/settings`: operator pages with nested routes where supported.
- `/api/*`: loopback API proxy, including the configured LinkedIn OAuth callback.
- `/crafts`: MDX-backed craft catalog with protected defaults and owner-private variations.

The operator pages deliberately remain localhost-only, consistent with the source branch's security model. Do not expose the Fastify server or Chrome CDP publicly. Live changes require the platform-specific approvals; integration tests use local fixtures.

## Checks
```sh
pnpm test
pnpm test:frontend
pnpm typecheck
pnpm build
pnpm --filter @utomator/backend test:integration
```

Keep the separate portfolio in `surdma/devsurma-frontend`; this repository does not ship portfolio About, Articles, Projects or personal Resume pages. The backend's owner context files are internal seed/evidence data, not a public portfolio or a dependency on the old frontend.

See `apps/backend/README.md` for runtime and connector details.

## Crafts and ownership
Six predefined crafts are stored as MDX source templates in `apps/backend/crafts/default/` and persisted in the existing owner-scoped database documents table. Everyone sees the same immutable defaults. A user can clone a default or create/import a new craft: the copy is private to their authenticated owner and can be updated or deleted without touching any other account. MDX is the authoritative persisted format; the editable flow graph is derived from it. A one-time, local-only importer transfers pre-existing `.runtime/skills/library.json` entries into personal crafts without overwriting defaults. Portable `.skill` exports remain compatible with agent skill bundles.
