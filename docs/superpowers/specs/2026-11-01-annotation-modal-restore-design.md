# Design: Restore the YAML-driven annotation modal across chat, reviews, and workflow stages

**Date:** 2026-11-01
**Status:** Approved (user confirmed Approach 1)
**Branch base:** `work/mator-e2e-tracked-20261101`

## Problem

On 2026-11-01 the Mator e2e work (`5aee2d9`, `b480ab1`) replaced the original
annotation modal approach with a thumbnail grid + pins-only dialog. The original
YAML-driven annotation experience — explicit pencil entry, Circle/Rectangle/Draw
shape tools, allowed-action mapping, voice commentary, edit-event history, and
server-side annotation YAML — still exists as `VisualReviewPanel`, but is no
longer reachable from chat images and has no edit entry from the workflow
annotation stage. The product goal is to restore that original approach everywhere
without creating a second annotation engine.

## Decision (approved by user)

- Reuse the canonical `VisualReviewPanel` as the one annotation modal on all three surfaces.
- Reuse the visual-review YAML pipeline (`POST /visual-reviews`) as the one persistence path for chat image annotations.
- Workflow artboard dialog stays read-only with a single "Annotate further" clone-mode entry.
- Run screenshot review modal is unchanged (already correct).

## Architecture

One `VisualReviewPanel` instance is mounted once at
`apps/frontend/components/dashboard/dashboard-shell.tsx` (it already is). Mator
chat and the workflow artboard dialog open that instance through callbacks
instead of rendering their own editors. Annotation data flows exclusively
through the existing visual-review endpoints (already allowlisted in
`apps/frontend/app/api/[...path]/route.ts`):

- `POST /visual-reviews` — create review + YAML (1–15 annotations, allowed
  actions, `tag` edit event required server-side by `apps/backend/src/core/visual-review.ts`).
- `GET /visual-reviews/:id/yaml` — saved annotation YAML.
- `GET /visual-reviews/:id/image` — review image.

## Component changes

### 1. Chat images (`mator-attachment-preview`, `mator-composer`, `operator-chat-panel`)

- Thumbnail keeps its existing open action and gains a small pencil button
  (≥44×44 touch target) when full-editor annotation is available.
- Opening the full editor builds an `ImageSource` (`kind: 'upload'`):
  - pending draft asset: read the local `File` to a data URL (same reader flow as
    `attachImage`);
  - sent attachment: fetch its authorized file URL, convert to a data URL
    client-side, reuse the 8 MB cap from `validateReviewImage`.
- Context `platform` / `handle` / `pageUrl` are forwarded from the active
  pipeline selection (`dashboard-shell` prop chain); `nodeId: 'annotation'`;
  annotation note is prefilled from the dictated/typed draft text.
- **Fallback:** when valid page context is missing, the current quick pins modal
  remains unchanged (keyboard-friendly textual marker authoring per the M2
  accessibility reference).
- On save success: thumbnail chip and chat event show
  "N notes · YAML" linking to `/visual-reviews/:id/yaml`; the workflow
  `annotation` node and reviews list refresh via the existing `onReviewSaved`.

### 2. Chat asset ↔ review linkage (backend, additive)

- Extend the `annotate_image` Mator action (`apps/backend/src/core/mator-actions.ts`)
  to accept an optional `reviewId`, validated as a UUID in the same style as
  `annotationId` in `visual-review.ts`.
- `apps/backend/src/core/mator-attachments.ts#upsertMarkers` persists `reviewId`
  in the chat asset metadata.
- `apps/backend/src/core/mator-agent.ts` event projection exposes `reviewId` so
  galleries render the YAML link on reload.
- No changes to visual-review validation; YAML honesty stays server-enforced.

### 3. Workflow artboard dialog (`workflow-artboard-annotation-dialog.tsx`)

- Stays read-only; each saved-review card gains one "Annotate further" button
  that opens the same panel in clone mode (`source.kind: 'review'` with
  `initialAnnotations`), creating a **new** review version. Approved originals
  are never edited (existing invariant).

### 4. Run screenshot review modal

- No behavioral change; verify with existing tests only.

### 5. Targeted cleanup

- Remove the duplicated `throw err;` statement in `use-mator-chat.ts#saveMarkers`.

## Error handling

- Attachment bytes unfetchable or oversized → error state in the composer/chat
  path; pencil stays disabled; no silent fallback.
- Review save error → panel stays open with its existing error display.
- Link-to-asset PATCH failure after a successful review creation → visible
  warning "Saved as review <id> but could not link to this message" with a retry
  action. Never fabricated as success (evidence honesty invariant).

## Testing

- Backend: extend existing `node --test` suites (e.g. `server.test.ts`,
  `mator-actions`/`mator-attachments` coverage) for `reviewId` validation and
  metadata projection. New files must be added to `package.json`'s explicit test list.
- Frontend: extend `tests/mator-chat-ui.test.mjs` (pencil affordance, context
  forwarding, YAML link), `tests/dashboard-component-structure.test.mjs`; add a
  link-logic test with mocked fetch. Explicit test list updated in
  `apps/frontend/package.json` when new files are added.
- Verify commands: `pnpm test:backend`, `pnpm test:frontend`,
  `pnpm --filter @utomator/backend typecheck && build`, same for frontend.
- Documentation: update `docs/architecture/mator-end-to-end-implementation-handoff.md`
  ledger with the IMPLEMENTED → TEST → REVIEW status for this restore.

## Invariants preserved

- Evidence honesty: a saved review is real server-side evidence; a failed link
  is reported as failed; pins without review context remain honest quick markers.
- One Runner, one annotation engine, one YAML path.
- Loopback-only binding and no runtime AI dependency untouched.
