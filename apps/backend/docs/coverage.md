# Utomator source coverage and pending automation work

Sources reviewed: apps/frontend/docs/linkedin-profile-optimization.md, about-positioning.md, about-evidence.md, portfolio-evidence.md; the original .playwright-cli/ JS and YAML histories; root YAML/PNG captures.

## Repeatable working stages
1. Read portfolio and résumé facts and provenance before proposing changes.
2. Audit the live owned profile, capturing current DOM/snapshot evidence.
3. Compare each live observation to the reviewed draft only where the field exists and was actually observed.
4. Classify as already correct, review candidate, needs owner confirmation, or not observed.
5. Apply one explicit approved action with exact selectors and ownership checks.
6. Re-open the persisted editor or profile, verify the saved value and record a result.
7. Expose the live SSE event stream, human approvals and evidence metadata to the local portfolio UI.

This is a deterministic repeatable workflow. Archived YAML/PNG captures show *past* controls; they are not executable instructions and must never override live browser observations.

## Historical capability inventory

| Source artifacts | Recorded intent | Current implementation |
| --- | --- | --- |
| apply-about.js, about-form.yaml, edit-intro.yaml | Headline/About copy, editing, structured paragraphs | Individual field updates with approvals |
| apply-bullets.js, position-filled.yaml, position-new.yaml | Edit employment descriptions and dates | Existing position description, optional confirmed dates; not generalized experience creation |
| add-skills-v2.js, add-skill-dialog.yaml | Choose exact skill catalog entry | Single confirmed skill |
| add-websites.js and contact snapshots | Contact details and website type | One explicit website row; no phone-visibility edits |
| batch-projects.js and project screenshots | Project creation, media, association | Single project with optional media; association needs operator review |
| featured-restructure.js | Add links, remove stale Featured cards, ordering | Add only; removal/reordering not validated |
| delete-post1c.js, post menu scripts | LinkedIn activity cleanup | Not implemented; archived only |
| x-apply-profile.js and x-banner.png | X bio, location, website, header image | Field edit and local banner upload |
| x-post-pin.js, x-post-pin2.js | Publish and pin an authored post | One at a time with approval |
| x-search-sweeper.js, x-mega-clean.js | Mass deletion and repost removal | Not replayed; security and rate-limit risks |
| x-restrict-probe.js | X visibility/settings | Read-only historical reference |

## Evidence limits
- A passing mock-browser test cannot establish current LinkedIn/X selector stability or provider acceptance.
- The LinkedIn guide includes owner confirmation rules for MilliHub dates, title claims, phone display, education dates and credential IDs. Do not silently fill gaps.
- Screenshot and ARIA snapshot files are archived observations, not training weights, optimization metrics, or instructions from the original LLM.
- No AI provider is connected. The chat-like operator panel accepts deliberately constrained commands; unfamiliar natural language is not interpreted as a change request.
- The audit assessment marks a different headline as **review-candidate**, not incorrect. X bio has no authoritative comparison draft.

## Next engineering candidates
Broaden *read-only* audit of education, experience titles/dates, profile completeness, Featured entries and skills with explicit provenance; build a reviewable batch plan with per-action stop points; add support for LinkedIn project association and safe media previews; add session-specific observations and replay fixtures for each historically observed UI state. Do not enable bulk deletion or privacy changes without a separate threat model and reproducible tests.

## 25 October: execution graph and navigation-race guard

The portfolio's `/workspace` workflow surface now uses a React Flow artboard with connected nodes for the **actual single-action workflow**. Operator focus, context menus, pan/zoom, step telemetry, action selection and parameter inspection are interactive. Nodes representing required ownership, approval and verification stages and their connectors are **locked**, because the Fastify runner still executes a fixed, audited action path. The canvas is not advertised as a general user-programmable DAG or an autonomous LLM workflow engine. The active action in the graph is the same action submitted in the Fastify `/runs` payload.

A browser may redirect after `page.goto(..., waitUntil: 'domcontentloaded')`. For read-only audits only, `observeAfterNavigation` now retries a destroyed execution context at most twice and verifies the expected owned profile path and official platform host. Browser fixture tests simulate the reported failure. Mutations (Save, Publish, Delete) are never automatically retried to avoid duplicates. Real-provider checks remain necessary because LinkedIn/X redirects and selectors may change.
