# Dashboard pipeline controller refactor

Scope: `apps/frontend/components/dashboard/dashboard-shell.tsx` and its page-specific modules.

## Behavior preserved

- Dashboard routes and the local-only API proxy remain unchanged.
- Runner is still the only executable browser workflow. Starting a run still validates the selected
  account, workflow revision, and required fields.
- Streamed status, approval and input events remain associated with the selected run. Events from
  another run are discarded; replayed event IDs are deduplicated.
- Pausing, resuming, cancelling, and approving checkpoints use the same endpoints.
- Saved workflows continue to use revision-checked persistence and retain the selection-epoch guard
  against stale asynchronous responses.
- Growth YAML selection still validates the compiled server response.
- Mator commands remain structured commands; there is no connected AI model.
- Chat transcript, evidence screenshots and annotation editors retain their existing visible
  behavior and test IDs.

## Page-local ownership

- `use-workflow-workspace.ts`: workflow state, catalogue loading, saving, selecting and applying
  plans and Growth templates.
- `use-run-monitor.ts`: run event stream, polling, run state, checkpoint actions.
- `run-event-utils.ts`: pure filtering, deduplication, refresh and terminal logic.
- `use-visual-reviews.ts`: image attachment, screenshot annotation, saved review
  loading and persistence, with explicit callbacks for page-specific side effects.
- `visual-review-model.ts`: pure upload validation, review page targeting, and
  the workflow note used for tagged annotations.
- `use-chat-messages.ts`: operator message state and notices.
- `use-operator-commands.ts`: structured chat/craft command orchestration.
- `pipeline-workspace.tsx`: workflow artboard, parameter forms and run controls.
- `operator-chat-panel.tsx`: Mator transcript, evidence and review presentation.
- `checkpoint-dialog.tsx`: explicit approval and input presentation.
- `run-models.ts`: shared page-local types.
- `default-workflow-plan.ts`: isolated initial plan factory.

The parent coordinates cross-feature interactions and visual-review editing; those interactions
remain on this page rather than becoming global components.

## Verification

Frontend unit/route tests (including the visual review model), TypeScript, formatting and ESLint, production build, browser integration
and responsive/accessibility checks are required before this refactor is considered validated. Live
LinkedIn account execution remains outside fixture-based CI and is not claimed by this structural
refactor.

## Dashboard component migration

The dashboard now lives under `apps/frontend/components/dashboard/` with
`dashboard-shell.tsx` as the route-level coordinator. Feature modules are
grouped into `career/`, `connections/`, `crafts/`, `editorial/`,
`growth/`, `intelligence/`, `pipeline/`, `research/`, `reviews/`,
`settings/` and `workflows/`. The former `components/automate/` directory
is removed. Previously unreferenced `intelligence-studio.tsx` and
`linkedin-growth-hub.tsx` were also removed after checking their consumers.

The career section editor, résumé preview, workflow step card, shared workflow
types and craft graph node/MDX serializer are separate from their page
controllers. The remaining large orchestrators should be decomposed only with
behavior-level tests and a route/consumer trace, not by dropping live UI.
