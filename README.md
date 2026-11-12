# Utomator

Utomator is a local-first, human-controlled automation product. The repository contains two
applications in one npm-compatible, pnpm-managed workspace:

```text
apps/
  frontend/   Next.js landing page, dashboard, pipeline, crafts, editorial, growth and other operator pages
  backend/    Fastify API, Playwright runner, connector services, Drizzle database and tests
```

This repository is the standalone home for Utomator after migration from `surdma/devsurma-frontend`
branch `utopia`. The separate personal portfolio and its About, Projects, Articles, and public
Resume pages are not part of the product. Historical browser captures, personal artwork and old
root-level Utomator files are not shipped here.

## Routing

- `/` is the public product landing page.
- `/dashboard` opens the authenticated/local-only operator area, redirecting to
  `/dashboard/pipeline`.
- `/dashboard/pipeline` is the primary automation pipeline and conversation canvas.
- `/dashboard/crafts` and `/dashboard/crafts/:id/source` provide a shared-template catalog and
  personal MDX/graph editor.
- `/dashboard/growth`, `/dashboard/editorial`, `/dashboard/research`, `/dashboard/history`,
  `/dashboard/profile`, `/dashboard/resumes`, `/dashboard/observer`, `/dashboard/memory`, and
  `/dashboard/settings` are operator modules.
- `/api/*` is the allowlisted Next.js-to-Fastify API proxy. It is not a user-facing page.

No operator page lives directly at the frontend app root. Public hosting requires the OIDC
authenticated gateway. The local Next.js operator and proxy continue to reject non-loopback access.
Never expose the backend, browser CDP endpoint or tenant storage directly.

## Craft ownership

Crafts are persisted in the Drizzle-backed `utomator_documents` store, with tenant identity derived
from authenticated service context. Shared built-in Craft definitions originate in
`apps/backend/crafts/default/*.mdx` and are seeded into each tenant's database. They are
**read-only**; updates to shipped defaults never overwrite user variations. A user may clone a
default or create a new personal Craft. The personal copy, its graph, MDX, revisions and deletion
belong only to that tenant. The backend accepts and exports graph/MDX round-trips with `<CraftNode>`
elements and `Next` links.

The library can import a legacy local `.runtime/skills/library.json` once, as private Crafts. Hosted
tenants never read another tenant's legacy files. `SKILL.md` in exported ZIP files is intentionally
retained as a portable agent-interoperability filename, not an in-app product name.

## Local development

Requires Node.js 22+, pnpm 10 and Chromium:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @utomator/backend exec playwright install chromium
pnpm dev:automate
```

Visit `http://127.0.0.1:3000` or the local `/dashboard/pipeline` operator page. The Fastify API
binds to loopback port 3101. Local SQLite is configured by the development launcher when PostgreSQL
`DATABASE_URL` is absent.

## Validation

```sh
pnpm test:frontend
pnpm test:backend
pnpm --filter @utomator/backend test:hosted
pnpm --filter @utomator/backend typecheck
pnpm --filter @utomator/backend build
pnpm --filter @utomator/frontend typecheck
pnpm --filter @utomator/frontend build
pnpm --filter @utomator/backend test:integration
```

The fixture-driven browser tests do not change real LinkedIn or X accounts. Live social publishing
and browser actions require explicit owner authorization, connector verification and confirmation
checkpoints. See `apps/backend/.env.example` and `apps/backend/README.md` for service setup and
limitations.

## Architecture and product knowledge

[ARCHITECTURE.md](./ARCHITECTURE.md) is the entry point. It maps the system that runs today and the
proposed [Agent-Operated Remote Browser with Human-in-the-Loop (ARBHIL)](./docs/architecture/arbhil.md)
design: an agent drives a remote Chrome, a human can watch and take over, and secrets stay out of
the agent context. The ARBHIL diagrams were reconstructed from a design summary and should be
reviewed against the original session. They are a proposal. They do not describe the runner,
screencast, or connector vault that the code implements today.

The [documentation index](./docs/README.md) connects the
[unified execution-engine proposal](./docs/architecture/unified-growth-workflow-engine.md),
[expert-methodology knowledge](./docs/knowledge/growth-craft-methodology.md) and
[Mermaid/SVG visual library](./docs/architecture/diagrams/README.md). These are proposed designs,
not claims that Craft MDX already compiles directly into the Runner.
