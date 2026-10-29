# Unified Growth workspace: implementation plan

## Verified current path

- apps/frontend/components/automate/linkedin-growth-capabilities.ts is the canonical 15-capability
  registry.
- apps/frontend/components/automate/linkedin-growth-hub.tsx was the descriptive Growth interface.
- apps/frontend/components/automate/crafts-library.tsx is the existing visual and MDX editor, using
  /api/crafts.
- apps/backend/src/crafts/library.ts seeds six default MDX graphs and persists owner-scoped clones.
- apps/frontend/components/automate/pipeline.tsx provides dashboard routing, navigation and chat
  commands.

## Planned stages and implemented file surfaces

1. Inventory 15 capabilities, all actions, coverage targets and guardrails.
2. Add 15 dedicated MDX designs and rewrite six existing generic designs without changing stable
   IDs.
3. Register the resulting 21 default templates with the existing validation and document store.
4. Replace the catalog with an outcome-first Growth library; add the exact capability details panel.
5. Reuse the visual/MDX editor, clone, import/export, chat and versioning paths.
6. Require an outcome and audience before creating a personal growth flow.
7. Consolidate the nav under Growth, add nested visual/source routes, redirect old Crafts paths.
8. Add backend source-integrity/roundtrip/inventory tests and frontend
   navigation/feature-preservation checks.
9. Validate with typecheck, backend tests, frontend tests, lint, builds and real browser smoke
   tests.
10. Hold Git release until independent review and runtime evidence are sufficient.

## Test and release matrix

- Backend: initial seeding returns 21 defaults; all action text, availability, prerequisites and 20
  profile requirements present; MDX parsing round-trips; immutability/versioning/tenant isolation
  persists.
- UI: catalog, search/filter, outcome journeys, details, clone, creation, nested tabs, import,
  export and source graph synchronization.
- Permissions: a graph does not trigger live LinkedIn actions and planned capabilities are labeled
  honestly.
- Regression: old deep links still work, /crafts API unchanged, document tenants isolated and
  personal clones unchanged after default updates.
- Release: CI checks in .github/workflows/utomator-integration.yml, code review and dogfood; do not
  represent PR creation as successful deployment.

## Risks

The local environment might lack the private repository checkout. In that case GitHub connector
changes do not demonstrate a passed test. Run the repository CI on a draft PR, inspect failure
evidence, and do not mark ready to merge without review and successful checks.
