# Six-pipeline Growth profile sample

> The existing Runner remains the only browser-workflow executor. This is a staged read-only orchestration sample, not a new engine or an automatic twenty-field profile optimizer.

## Entry point and YAML contract

The local-only UI at /growth/default-growth-profile presents the same sample in /dashboard/pipeline. Its source is apps/backend/growth/profile-workflow.yaml.

One Growth describes nine proposed capability requirements and twenty independent coverage targets. Six sequential YAML pipeline stages coordinate the process. A coverage target is a requirement assigned to a pipeline, not an executable operation in itself.

| YAML stage | Owned coverage | Existing Runner workflow |
| --- | --- | --- |
| 1. Identity and visual presentation | Photo, banner, name/pronunciation, verification | Read-only authenticated profile audit |
| 2. Headline and positioning | Headline, About, custom URL | Read-only authenticated profile audit |
| 3. Career history | Experience, education, skills, certifications | Authorized experience detail-page inspection |
| 4. Professional proof | Featured, projects, publications, honors, volunteering | Authorized project detail-page inspection |
| 5. Opportunity readiness | Recommendations, Services, contact, career preferences | Read-only authenticated profile audit |
| 6. Consolidated review | All twenty targets | Final read-only profile audit and outcome report |

Each stage compiles a reviewed WorkflowPlan, executes through the preexisting Runner, and waits for its real evidence and approval gate before the next stage may be launched. The coordinator only tracks dependencies, source versions, owner-supplied evidence and completed child runs. No new browser executor, new generic authorization bypass or simulated profile mutation is introduced.

## Evidence and truthful outcomes

Every section begins in a **missing** state. Owners can attach a concrete textual observation with a digest and timestamp; the record remains **owner-supplied and unverified**. A whole-page Runner observation establishes that an authorized profile page was inspected, but it cannot demonstrate that a particular field received an independent rubric-based audit. The run therefore preserves twenty distinct evidence statuses and never promotes whole-page observation into field verification.

The final composite result distinguishes actual Runner receipts from owner claims. Missing sections remain missing. A completed six-stage read-only run does not assert that the LinkedIn profile was edited, improved, or that new opportunities occurred.

## API execution path

1. POST /growth/workflows/profile/runs verifies a linked account and starts stage one through Runner.start.
2. GET /growth/workflows/profile/runs/:id shows the current child, checkpoint, source evidence and twenty section states.
3. Existing /runs/:id/decision and /runs/:id/resume manage real Runner checkpoints and pause states.
4. POST /growth/workflows/profile/runs/:id/evidence saves a source-labelled owner observation for a current-stage section.
5. POST /growth/workflows/profile/runs/:id/advance requires a completed Runner child with a real archived evidence artifact, then launches the next dependent compiled stage.

Production data is tenant-scoped in the existing DocumentStore under the growth-runs namespace, including the source digest and per-run stage snapshot. The no-database test mode uses in-memory records.

## Scope that remains

The six child runs currently inspect only supported pages. Independent extractors and rubrics for all twenty sections, a typed fan-out/join engine, provider-authorized editing inside the composed sequence, personal profile-photo/banner mutations, and real growth-outcome measurement remain future implementation work. The nine reviewed editing operations remain accessible through the existing guarded Pipeline controls. MDX, Research and Editorial cannot be retired without verified migration.
