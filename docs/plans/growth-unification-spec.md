# Unified Growth workspace: Product specification

Baseline: surdma/utomator main at a99691d1d5bfd0a0d9d40e6c3c0833fc13a41b85

## Problem and goal

Growth defined 15 LinkedIn capabilities, including 107 proposed actions and 20 profile section requirements, but displayed only descriptive cards. Crafts provided six separate MDX visual graphs, editor operations, versioning, cloning and exports. The objective is one Growth workspace linking professional visibility, credibility, authority and relationships to measurable opportunity outcomes.

## Information architecture

- Growth catalog: 15 LinkedIn growth capability graphs plus six existing domain-specific templates, followed by any personal graphs. Outcome-focused journeys, text search and category/collection filters.
- Growth detail: summary, real availability, missing requirements, delivery priority, action inventory, permissions, guardrails, specialized profile coverage and relevant journeys.
- Growth visual: the existing editable graph/inspector, with immutable defaults and clone-to-edit.
- Growth source: the existing MDX parser, editor, copy, apply and export tools. The graph and source must represent the same instructions.
- Growth creation: objective and audience required, and written into a distinct five-stage graph. Use modal dialog for create/delete and restrained content-first design without banners.
- Compatibility: old nested Crafts paths redirect to equivalent Growth routes, while /crafts API and stored personal identities remain stable.

## Delivery boundaries

A saved graph and its proposed actions are design instructions, not an integrated provider pipeline. The 15 canonical capabilities retain their exact descriptions, 107 proposed actions, partial/planned statuses, priorities, evidence requirements, modes and prerequisites. Four capabilities have narrower working subflows. Do not expose unimplemented social publishing, scraping, messaging, invitations, engagement or account modification as usable actions. The 20 profile sections describe audit coverage requirements, not completed audits.

## Acceptance criteria

1. 21 immutable defaults exist with unique slugs; six original identifiers are preserved.
2. The 15 new MDX graphs preserve every existing action, available-now and required-before-full-delivery statement, permission mode and priority; profile graph retains 20 target sections.
3. The catalog shows 21 defaults and any per-owner variants. Every default has an accessible visual graph and MDX source.
4. Search, journey navigation, category filters, import, clone, visual editor, source synchronization, save, version conflicts, delete and export remain available.
5. Growth nested routes and legacy Crafts redirects preserve deep links.
6. Owner-created flow is not generic: its title, objective and audience appear within its instructions.
7. No new unauthorized LinkedIn provider operation or synthetic performance claim.
8. Test, lint/typecheck, build, independent review, dogfood and CI gate release.

## UX and regression risks

Prefer visible navigation and predictable full-page detail over banners or nested modals. Keep focus states, touch targets, empty/error states and responsive widths. Preserve all existing API, tenant isolation, default immutability and source-graph parse constraints. Changing the six default templates must not alter stored personal clones.
