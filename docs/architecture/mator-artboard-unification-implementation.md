# Mator Artboard unification: stacked PR implementation ledger

> **Status: U1 IMPLEMENTED and focused CI-validated; NOT FULLY REVIEWED OR MERGE-READY.** This draft workstream branches from PR #15 (`d398f60ce59743e047fdf366b88e05b435117c2b`) and targets `work/mator-e2e-tracked-20261101`, **not** `main`. Preserve PR #15's Mator chat/voice changes. The source-backed prior investigation and five Mermaid diagrams are in [mator-unified-artboard-investigation.md](mator-unified-artboard-investigation.md).

## Verified baseline (2026-11-03)

- `apps/frontend/components/dashboard/pipeline/pipeline-workspace.tsx` hosts the current `WorkflowPlanEditor` and `FloatingWorkflowControls` inside the workspace pane. `app/dashboard/pipeline/page.tsx` redirects to the workspace.
- `workflow-plan-editor.tsx` currently replaces its normal `ReactFlow` canvas content with a `GrowthProfilePipelines` component whenever a Growth template is selected. That renders its own header, Growth controls, and nested `GrowthWorkflowArtboard` with another `ReactFlow`. The editor toolbar is already outside the conditional and should remain mounted.
- `growth-graph-model.ts` already converts compiled Growth stages and actual child `WorkflowPlan.links` into pipeline and task nodes. `use-growth-run-journal.ts` correlates task status with real child run logs. Reuse these models instead of creating a duplicate planner/renderer.
- `WorkflowPlan` is validated as a **serial** chain with typed earlier-step bindings. `workflow-registry.ts` persists revisioned validated JSON and `GET /workflows/:id/yaml` exposes the generated YAML representation. The Growth compiler reads **static** restricted YAML templates and currently allows task-title overrides only. Its read-only `GET /growth/templates/:id/yaml` is not an editable configuration persistence API.
- The Growth coordinator starts the **first** stage and advances serially after real child evidence and Runner cleanup; there is no independently selectable arbitrary pipeline execution route. `GrowthBlueprintWorkflow` is design-only and cannot execute.
- At the inherited PR #15 head, Actions checks include code-quality and integration failures. Do not attribute these failures to this stacked branch without comparison.

## Product interaction contract

Keep one persistent Artboard workspace and one visible graph canvas. The current workflow context chooses the graph projection, not a replacement editor. For a saved `WorkflowPlan`, node selection uses existing step-specific forms and revisioned save. For a selected Growth YAML program, show pipeline overview and an in-place pipeline task drill-down with breadcrumb back. Growth task information remains **read-only** until an owner-scoped, validated, revisioned source-YAML write contract exists. In all modes, show only real recorded run status and results.

Retain existing header/toolbar, selection, run forms, evidence links, account checks, chat state and approvals. Relocate secondary Growth coverage/requirements into a modal or compact secondary entry point rather than dropping records. Do not expose a pipeline Run action where the server cannot honor it. Keyboard-accessible task and pipeline navigation, responsive graph, empty and error states, and reduced-motion behavior are mandatory.

## Execution work packages and gates

| Slice | Owner | Scope | Acceptance proof |
| --- | --- | --- | --- |
| U1: One Artboard shell | UI/UX → Frontend | Replace the conditional standalone Growth screen with Growth graph content hosted by the same Artboard shell; reuse the current graph model and run-control consumers | Workspace toolbar remains identical across selection; keyboard drill-down/back; no duplicate Growth header/canvas, no lost run/evidence controls |
| U2: Context and selector | Frontend → Test | Explicitly distinguish saved executable workflows, compiled Growth programs and design-only blueprints; reset scoped selection and journals on switches | No state leaks, stale async responses or fabricated workflow availability; unchanged saved plan revisions |
| U3: Task configuration | API/Contract → Backend → Frontend | Use existing step-schema forms for saved plans; implement source-preserving, versioned Growth YAML editing **before** enabling Growth task editing | Invalid writes reject, success survives reload and YAML source round-trip, optimistic conflict handling; no arbitrary task rewrites |
| U4: Runtime semantics | API/Contract → Backend → Test | Preserve full workflow and serial coordinator; independently run a pipeline only with explicit dependency/account/evidence checks and run identity | Genuine Runner events and durable attribution; fail closed on missing upstream data |
| U5: UI polish | UI/UX → Frontend | Responsive layout, floating secondary tools, accessible dialogs, motion, artifacts | Playwright desktop/tablet/mobile + keyboard/axe + reduced motion; existing Mator chat unaffected |
| U6: Docs/review/release | Test → Reviewer → Dogfood → Git | Align five Mermaid docs to actual post-change system and validate API/UI/Runner | Tests, review, real runtime journey, branch SHA/diff, CI green or blockers documented |

### Immediate evidence-driven implementation sequence

1. Map the exact `WorkflowPlanEditor` component tree, Growth graph consumers, Next proxy allowlist, and frontend tests. Capture a reproducible regression for editor-shell replacement.
2. Implement U1 as a coherent, bounded patch, retaining existing working APIs and error paths. Do not restructure backend during a UI shell integration.
3. Run `pnpm --filter @utomator/frontend test`, `typecheck`, `lint`, `build`; focused Playwright interaction and responsive tests, then backend API/Runner regressions. CI does not replace executable local checks when a checkout is available.
4. After independent code review and Dogfood, land reviewed source in this **stacked draft PR**, update this ledger with exact SHA and test evidence; expand to U2-U5 after each dependency gate.

## Validation reality and blockers

This session can read and write the remote repository through GitHub, but `git ls-remote` from the executable container fails with `Could not resolve host: github.com`. Therefore a local full workspace checkout, dependency install, browser startup and Playwright run are not currently available. Documentation and planned work are not equivalent to production implementation. **Do not move this PR out of draft on the strength of planning alone.**


## U1 source integration and validated UI revisions (2026-11-03)

**Status: production code committed, with real GitHub Actions TypeScript, focused unit, frontend build, and selected real-browser integration checks passing. A full repository-wide green gate and independent Dogfood/review are still outstanding.** The implementation change is scoped to frontend surface and regressions, with no new backend endpoints or permissions. The source is prepared to route the existing saved-plan graph and Growth YAML graph through a single React Flow canvas inside the existing editor shell. The separate Growth screen and nested Artboard are intentionally retired.

The compiled task inspector is **read-only**; task titles, kind, messages, typed input bindings, coverage, journal and source YAML may be inspected, but changes to Growth YAML are not persisted because the server does not expose a validated write endpoint. The same existing Growth coordinator handles starting a complete serial program, child approval/resume/cancel, evidence submission and allowed advance. No independent selected-pipeline launch is advertised.

The browser regression tests specifically assert one active graph, six connected profile pipelines, dependency edges, task drill-down and read-only details, a modal entry to real execution/evidence controls, and no Runner launch for design-only Growth YAML.

### Unified editor composition

```mermaid
flowchart TD
  Workspace[PipelineWorkspace] --> Choice{Workflow opened?}
  Choice -->|No| Empty[Blank Artboard - no automatic workflow]
  Empty --> New[Create new workflow]
  Empty --> Library[Workflow library]
  Empty --> Resume[Resume saved workflow]
  New --> Draft[Unsaved valid four-step Runner draft]
  Library --> Sources{Template source}
  Sources --> ActionTemplates[Action templates from platform catalogue]
  Sources --> YamlTemplates[YAML programmes from restricted catalogue]
  ActionTemplates --> SaveCopy[Save own workflow revision]
  Draft --> Shell[WorkflowPlanEditor persistent shell]
  Resume --> Shell
  SaveCopy --> Shell
  YamlTemplates --> Shell
  Choice -->|Yes| Shell
  Shell --> Toolbar[Template selector and action rail]
  Shell --> Graph[One ReactFlow canvas]
  Shell --> Footer[Contextual status and evidence entry]
  Shell --> Dialog[GrowthWorkspaceDialogs]
  Toolbar --> Leave[Return to blank workspace with unsaved confirmation]
  Graph --> Context{YAML programme selected?}
  Context -->|No| Saved[Editable WorkflowPlan step cards]
  Context -->|Yes| Growth[buildGrowthGraph]
  Growth --> Overview[Connected pipeline cards]
  Overview --> TaskGraph[Selected pipeline task cards]
  TaskGraph --> ReadOnly[Read-only compiled configuration and journal]
  Dialog --> Controls[Existing GrowthRunControls]
  Dialog --> Evidence[Existing GrowthEvidenceForm]
  Dialog --> Coverage[Existing GrowthCoverageList]
```

Source: [diagrams/mator-unified-artboard-surface.mmd](diagrams/mator-unified-artboard-surface.mmd).

### Preserved execution and evidence boundary

```mermaid
sequenceDiagram
  actor Owner
  participant Artboard as Unified Artboard
  participant API as Growth Fastify API
  participant Coordinator as Growth Coordinator
  participant Runner as Existing Runner
  Owner->>Artboard: Select a YAML workflow
  Artboard->>API: GET /growth/templates/:id
  API-->>Artboard: Compiled stages and task plans
  Artboard->>API: GET /growth/templates/:id/runs
  API-->>Artboard: Owner-scoped run status
  Owner->>Artboard: Open execution and evidence
  opt Executable template, verified account
    Owner->>Artboard: Start Growth workflow
    Artboard->>API: POST /growth/templates/:id/runs
    API->>Coordinator: Start serial program
    Coordinator->>Runner: Start first compiled child
    Runner-->>API: Child status and journal
    Artboard->>API: GET /runs/:childId/logs
    API-->>Artboard: Recorded task events
    Owner->>Artboard: Submit owner evidence
    Artboard->>API: POST /growth/templates/:id/runs/:runId/evidence
    opt canAdvance and Runner idle
      Owner->>Artboard: Advance to next pipeline
      Artboard->>API: POST /growth/templates/:id/runs/:runId/advance
      API->>Coordinator: Verify evidence and release state
    end
  end
```

Source: [diagrams/mator-unified-artboard-execution.mmd](diagrams/mator-unified-artboard-execution.mmd).

### Outstanding before review or merge

- Run repository-wide strict code quality and full Playwright responsive/keyboard checks in a real checked-out workspace; focused GitHub Actions already executed typecheck, unit tests and three real-browser scenarios. The current sandbox has Node.js but cannot resolve/reach GitHub or acquire the pnpm checkout/dependencies.
- Independently review the compiled task selection behavior, focus return when a dialog closes, responsive graph viewport at phone/tablet widths, and status/evidence attribution.
- U2–U5 remain separate work packages; no source-preserving Growth YAML editing, arbitrary pipeline execution API, or provider-level profile updates are implied by U1.


## U1 clarification: initial canvas and workflow terminology

The workspace now starts with **no selected plan** even if local saved workflows are listed. Loading the dashboard fetches `GET /workflows` for the resume list but does not POST a default workflow or select the earliest saved plan. A user must explicitly choose **Browse templates**, **Create new workflow**, or **Continue a saved workflow**. The blank Artboard remains one UI entry point, not a second editor. The toolbar offers a way back, with an unsaved-change confirmation for drafts.

**Create new workflow** produces an *unsaved* minimal serial plan with the four mandatory Runner steps (`start`, `session`, `action`, `finish`). A true zero-step executable plan would violate backend `validatePlan`; only the landing canvas is genuinely empty. Saving uses the existing revisioned workflow endpoint, and no run is launched on creation or template selection.

The neutral **Workflow library** contains two explicitly differentiated sources: the current YAML programme catalogue and the real platform action-template catalogue. The first retains its existing supported/planning-only classification, and the second uses `workflow-templates/:platform` plus the revisioned saved-workflow API. No extra social platform automations have been invented; X shows actual action templates only. Growth remains a specific programme domain rather than the name of the whole template library.

The YAML pipeline/task cards now borrow the original saved-step card language, including numbered headers, grounded step-kind icons, real status pills, and useful footer affordances. Read-only compiled tasks are not misleadingly marked editable. The existing coordinator remains the sole execution path; evidence and checkpoint state are still tied to real Runner journals.

**Evidence:** GitHub Actions integration run [41643060127](https://github.com/surdma/utomator/actions/runs/41643060127) passed TypeScript/focused unit and **3 real-browser tests (0 failed)** for pipeline/drill-down, design-only nonexecution and blank Artboard action-template opt-in. [41644627061](https://github.com/surdma/utomator/actions/runs/41644627061) additionally passed the return-to-workspace/unsaved confirmation scenario. The full suite has inherited failures unrelated to the changed Artboard flow; maintain draft status and fix or triage them, not weaken their gates.
