# Historical LinkedIn and X automation: source-to-workflow analysis

## Evidence provenance

**Verified from GitHub repository history**, not from a live social-media session. Canonical
repository: `surdma/devsurma-frontend` (`master`). Important source commits:

- `45fdaf1d5e5a685f82b1d9402fc2d86f725d823a`: `.playwright-cli/*.js`, `.yml`, screenshots, console
  logs, and root `.yaml`/`.png` snapshots. This commit is the browser-interaction evidence
  collection.
- `55163391b1131c3d394f20a91e220101541b9e80`: prior `automation(linkedin)/` Express.js/Playwright
  application. Includes `config/`, `lib/`, `jobs/`, `routes/`, dashboard, README.
- `4ba156343d4f4875a6816b05e1f437b66dcc3ee5`: evidence-led v2 LinkedIn profile optimization policy.
- `43ab878b951f56a46533e22b4876aad63e0c4214`: deleted Fastify prototype with fixed responses, not a
  real automation engine.

GitHub history does not reveal unstaged files in the owner's local working tree. This analysis used
the commit inventory and representative browser scripts read through the GitHub connector. It does
**not** claim every PNG or every historical log was manually replayed or visually verified.

## 1. Repeatable procedural stages

1. **Evidence preparation.** Load owner-approved profile text from the existing portfolio and résumé
   evidence; cross-check names, dates, employment records and attribution. Never infer employment
   dates or quantitative results from git commits or screenshots. Prepare target values as typed
   inputs, not hardcoded profile data.
2. **Session establishment.** Launch persistent Chromium/Chrome profile or connect over a loopback
   Chrome DevTools Protocol (CDP) endpoint. Reuse authenticated browser context. If login, 2FA,
   CAPTCHA or a platform security challenge occurs, stop and hand control to the user; never
   circumvent it.
3. **Read-only UI audit.** Navigate to exact platform profile URL. Identify editable affordances,
   read accessible role/name and profile text. Save a screenshot before any mutation. Extract
   visible field values from DOM or Playwright locators, never trust an old screenshot as live
   state.
4. **Select narrow action.** Determine whether requested field is already correct, missing, or
   conflicting. Keep correct content intact and refuse ambiguous selections. Do not use broad
   DOM-index assumptions when a role/label exists.
5. **Fill.** Use `page.getByRole(...)`, `getByLabel(...)`, or previously observed `data-testid`
   locators. For ProseMirror contenteditable use `ControlOrMeta+A` and insert approved paragraphs.
   For combobox skills, read current `role=option` suggestions and select the exact match or prompt
   a human.
6. **Pre-save verification.** Read actual editor values or paragraph children. Require equality to
   supplied content. On mismatch, abort without clicking Save and save a diagnostic screenshot.
7. **Human checkpoint.** Stream a review request to dashboard; pause until the operator approves.
   Missing approval, cancellation or timeout must block the mutation. For irreversible post deletion
   require a second confirmation after the delete menu.
8. **Save and reopen.** Click the scoped Save control, navigate away, reopen a profile or edit form,
   verify persisted values. A click alone is not completion evidence. Detect failed media previews
   or posts that have not appeared.
9. **Completion reporting.** Emit structured run events, timestamps, local screenshot paths, and
   explicit verified, failed, blocked or cancelled state. A final quality score can only reflect
   personally observed live data; do not invent it.

## 2. LinkedIn source-map

| Original script/snapshot                                                                             | Observed intent or UI mechanism                                                                                                       | Utomator equivalent                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `.playwright-cli/apply-about.js`, `about-form.yaml`, `dump-summary-form.js`                          | Navigate to `/edit/forms/summary/new/`, wait for `.tiptap.ProseMirror`, replace About paragraphs, check paragraph structure, Save     | `edit-profile` About, approval, persisted editor check                       |
| `.playwright-cli/inspect-edit-intro.js`, `edit-intro.yaml`, `edit-intro2.yaml`, `headline-probe.js`  | Read Edit intro, use named Headline textbox; identify field and char count before Save                                                | `edit-profile` headline                                                      |
| `.playwright-cli/apply-bullets.js`, `dump-pos-form.js`, `position-filled.yaml`, `position-new.yaml`  | Open `/edit/forms/position/<id>/`, write separate experience paragraphs, verify node count, optionally set confirmed Start month/year | `edit-experience`, existing position only                                    |
| `.playwright-cli/add-skills-v2.js`, `add-skills-v2b.js`, `skill-state.yaml`, `add-skill-dialog.yaml` | Open skills editor, enter `Skill*`, read role-option list, resolve standardized names, Save, scroll to verify                         | `add-skill`, including typed human choice when suggestions differ            |
| `.playwright-cli/add-websites.js`, `dump-webtypes.js`, `verify-websites.js`                          | Edit contact-info form, add URL rows, select website type, reopen to verify                                                           | `edit-website`, explicit row index                                           |
| `.playwright-cli/fix-services.js`, `inspect-services.js`                                             | Edit services description without changing service categories                                                                         | `edit-services`                                                              |
| `.playwright-cli/batch-projects.js`, `pilot-project-aeko.js`, `inspect-project-form.js`              | Add project metadata, optionally attach link media; handle asynchronous preview and selection                                         | `add-project`, one project per run                                           |
| `.playwright-cli/featured-restructure.js`, `featured-affordances.js`, `verify-featured2.js`          | Delete obsolete Featured item, add link cards, edit title and description, verify                                                     | `add-featured` only; removal is intentionally not automated                  |
| `.playwright-cli/delete-post1c.js`, `map-post-menus.js`                                              | Inspect stale LinkedIn activity, match post menus, confirm deletion                                                                   | Not enabled without additional target-ID and content-ownership guards        |
| `.playwright-cli/v2-audit-*.js`, `verify-final2.js`, `verify-all.js`                                 | Revisit independent sections, capture fresh screenshots, ensure expected content exists                                               | `audit` and per-workflow verification (broader coverage remains to validate) |

## 3. X source-map

| Original script                                                                                         | Observed intent or UI mechanism                                                                                                | Utomator equivalent                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `x-auth-check.js`, `x-audit.js`, `x-state-map.js`, `x-settings-read.js`                                 | Determine authenticated state and available controls by reading actual profile/settings UI                                     | Signed-in edit affordance plus `audit`                                                                     |
| `x-apply-profile.js`, `x-apply-fields.js`, `x-bio-plain.js`                                             | Edit Profile dialog; distinguish Name, Bio, Location, Website; compare field values before Save                                | `edit-profile`                                                                                             |
| `x-apply-profile.js`, `x-banner.png`, `x-edit-probe.js`                                                 | `Add banner photo` file chooser, possible crop confirmation, Save, screenshot                                                  | `upload-banner`, image kept in local assets                                                                |
| `x-post-pin.js`, `x-post-pin2.js`, `x-compose-inspect.js`                                               | Open composer, insert exact text, check enabled Publish, post, find authored status, pin from caret menu, verify pinned marker | `compose-post` and separate `pin-post`                                                                     |
| `x-final-verify.js`, `x-verify-profile.js`, `x-state-check.js`                                          | Fresh profile read of Bio, web link, banner, pinned context and post                                                           | `audit` and post-edit verification                                                                         |
| `x-cleanup-batch.js`, `x-mega-clean.js`, `x-search-sweeper.js`, `x-patient-sweeper.js`, `x-sentinel.js` | Historically scanned posts, deleted authored posts and removed reposts with retry/skip logic                                   | Bulk sweep deliberately **not** replayed; `delete-post` targets one verified author URL with two approvals |
| `x-restrict-probe.js`, `x-restrict-state-*.png`                                                         | Inspected account privacy/restriction settings                                                                                 | Read-only historical evidence; no privacy setting changes included                                         |

**Important historical pitfalls:** The old Express human-loop returned immediately when
`paused === false`, even when a job requested `pauseBeforeSave`. This did not guarantee review. The
old Fastify experiment had no Playwright execution and called `res.json()` in handlers despite
Fastify's different reply API. Its SSE route did not represent actual job events. These shortcomings
must not be replicated.

## 4. Human-in-loop and browser semantics

- The user must be shown **which** profile/action is being edited. A decision must reference one
  exact run and checkpoint token; stale decisions are rejected.
- SSE is one-way: browser receives `status`, `step`, `audit`, `approval`, `input`, `screenshot`,
  `result`, and `error` events. Human answers go to a validated local HTTP command endpoint. No
  background LLM agent is running.
- Saved Chrome cookies and screens are local artifacts under gitignored `.runtime`; never send them
  through SSE or commit them.
- Do not rely on one historical CSS class, DOM order, timeout, or platform URL permanently. Prefer
  role and label selectors, exact cardinality, read-after-write verification, and fail-closed
  behavior.
- An operator can enter new text during a workflow when a LinkedIn autocomplete choice is ambiguous.
- The original data from `config/profile.js` are profile-specific **examples**, not a universal
  profile template. Never automatically apply them to another logged-in account.

## 5. Gaps before a production release

- Full, fresh visual reconciliation of every historic YAML/YML/PNG/log file is not yet done. Binary
  screenshots were inventoried from commit metadata, not all opened.
- Real Chrome login, live selectors, crop dialogs, post creation/pinning, LinkedIn media previews
  and persistence need manual integration tests. A local TypeScript parser and unit tests cannot
  prove these workflows.
- Selector stability, network errors, rate limits and anti-automation restrictions remain provider
  risks. No challenge bypass is implemented.
- Multi-user scheduling, durable profiles/jobs and remotely accessible control must not be
  introduced without Postgres/Redis, authentication, run-level access checks, and secure session
  separation.
- This deterministic app _applies user-authored copy_. It does not replace the language reasoning,
  evidence interpretation, or writing judgment originally supplied by an AI agent. That is a
  separate optional, offline authoring workflow.
