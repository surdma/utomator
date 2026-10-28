# Growth templates in the existing Pipeline artboard

## Correct hierarchy

A **Growth** is a goal, coverage requirements, and a versioned YAML workflow definition. It is not a separate dashboard route or another browser execution engine.

- **Growth template**: selected from the existing **Pipeline → Templates** modal, alongside supported single-action workflow templates.
- **Pipeline nodes**: top-level connected nodes in the existing workflow artboard. Dependencies come from YAML stage \`dependsOn\` relationships. A pipeline groups one or more coverage requirements.
- **Task nodes**: selecting a pipeline opens a connected inner graph built from its actual, validated \`WorkflowPlan\` and typed Runner task bindings. Each pipeline includes owner session validation, observations, evidence and approvals as prescribed by the reviewed plan.
- **Runner**: the only browser execution engine. The coordinator uses existing \`Runner.start\`, \`get\`, \`stepOutput\`, \`decide\`, \`resume\`, and \`cancel\`. No code path invents a second browser engine.
- **Evidence and outcomes**: page evidence and manually supplied section evidence remain distinct; owner claims never become independently verified field scores.

## Template discovery: no new page per Growth

\`GET /growth/templates\` discovers restricted, schema-validated YAML files from \`apps/backend/growth/*-workflow.yaml\`. \`GET /growth/templates/:id\` returns the compiled template including top-level stage connections and each embedded executable Runner task graph. \`GET /growth/templates/:id/yaml\` returns the exact authoring source.

The Templates modal displays every known LinkedIn Growth capability, marking those without a validated YAML definition **not available yet**. Any additional valid YAML definition is dynamically discovered even when the frontend capability inventory does not yet include its ID. There is no need to add a Next.js page, a React component, or a bespoke backend controller for each new Growth.

The existing older URL \`/growth/default-growth-profile\` only redirects to \`/dashboard/pipeline\`. The old MDX Growth library is preserved for compatibility until it has a validated migration.

## YAML structure and execution

The initial \`linkedin-profile\` manifest is a concrete example: six connected pipelines, twenty independently tracked coverage requirements, and task-specific YAML titles. Every stage has \`title\`, \`action\`, \`page\`, \`sections\`, \`dependsOn\`, and a mapping of reviewed \`tasks\`. The task names must match actual Runner step IDs; they may refine titles only, not replace execution operations or bypass security.

The compiler validates the restricted YAML syntax, metadata, coverage uniqueness, exact dependencies, registered actions and task IDs, and then creates real \`WorkflowPlan\` steps and links via the existing \`compileWorkflow\`. The coordinator snapshots the compiled plans and source digest before starting; each child invokes the pinned plan rather than recreating a different plan from a title.

Runtime progression:
1. Account ownership is verified before starting; the first child Runner opens an authenticated browser session.
2. The active pipeline executes its actual task nodes. The Runner requires its existing owner approval and evidence checkpoints.
3. The task that raises an error is recorded as a failed step in the existing Runner event journal. The outer pipeline receives a **red border** for failed/blocked runs; drilling into the pipeline highlights the **specific failed task** (from the run journal and \`currentStepId\`). The error and linked Runner run ID remain inspectable.
4. A subsequent pipeline may be launched only after the previous child completes with a genuine evidence artifact. The advancement remains explicitly operator controlled.
5. At the end, every coverage item retains its own missing/owner-supplied status. A successful read-only run does **not** imply that all profile sections were independently assessed or updated.

## Honest current limitations

The general catalogue and artboard support additional YAML-backed Growth definitions without custom UI pages. **Currently only the profile sample is authored and validated.** The current allowlisted Growth child operations remain read-only \`audit\` and \`audit-page\`. Composing arbitrary editing/publishing tasks, accepting stage-specific provider-write parameters, proper fan-out/fan-in DAG scheduling, field-level scoring, and complete outcome measurement still require separately reviewed backend work.

The existing single-action templates, saved workflow revisions, Growth MDX library, Creator Research and Editorial remain available until their replacement paths are verified. No live LinkedIn credentials or production profile edits are used to validate this sample.
