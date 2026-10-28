# Database persistence (Drizzle)

Fastify selects local SQLite unless DATABASE_URL is defined, in which case
PostgreSQL is used. An invalid or unavailable DATABASE_URL is a startup error,
never a silent fallback. Existing JSON records remain readable for migration;
new writes use the database. LinkedIn browser cookies stay in isolated Chrome
profiles, not in SQL.

## Setup

From the workspace root, after pnpm install:

```sh
corepack pnpm --filter @utomator/backend db:push
```

By default this initializes file:local.db under apps/backend. To use PostgreSQL,
set DATABASE_URL in an untracked .env file first. Use least-privilege DB credentials
and TLS on external connections. The server fails until its schema is applied.

## Migrations

For shared databases, generate, review, version and apply migrations:

```sh
corepack pnpm --filter @utomator/backend db:generate
corepack pnpm --filter @utomator/backend db:check
corepack pnpm --filter @utomator/backend db:migrate
```

Drizzle Kit RC5 uses migration folders containing migration.sql and snapshot.json.
The configured SQLite and PostgreSQL migration output directories are separate.
Review destructive operations before applying and back up existing data.

## Data stored

The Drizzle owner-scoped documents table has a composite
(owner_id, namespace, record_key) primary key and compare-and-swap revisions.
It holds account references, verification metadata, workflow defaults, and
immutable workflow revisions. Legacy JSON paths remain readable. New step
input forms are described by step-forms.yaml. The runner continues to execute
only allowlisted YAML operations and enforces ownership and explicit approvals.

Never expose Fastify, Chrome CDP or unencrypted session data to the Internet.

## Crafts

`crafts` and `craft-migrations` are validated document namespaces under the existing composite `(owner_id, namespace, record_key)` primary key. Each Craft record stores its validated MDX, scope (`default` or `personal`), optional clone-source ID, timestamp and optimistic version. The tenant owner ID must come from authenticated worker context rather than request input; no separate global in-memory Craft registry is authoritative. Defaults are loaded from bundled MDX at startup, while personal records remain unchanged across default revisions. Hosted workers have tenant-private databases.
