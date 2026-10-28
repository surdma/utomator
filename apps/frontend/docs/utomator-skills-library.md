# Utomator Skills Library

The locally hosted agent-skills authoring surface is at `/library`. It does not claim to have an LLM connected, and skill links never execute Playwright.

## Scope and storage

Skill projects are constrained to personal presence, portfolio, job hunting, applications, content, and social engagement. Each project has YAML-compatible trigger metadata, named step nodes, typed instructions, graph coordinates, connections, enabled state, and an optimistic-concurrency version. Initial templates are seeded on first access. Saved projects live in `apps/backend/.runtime/skills/library.json` on the owner's local machine.

## Navigation and workspace layout

The catalogue lives at `/library` and renders only project discovery, filtering, creation, and import. A selected project's dedicated graph editor uses `/library/[skillId]`; the corresponding source editor uses `/library/[skillId]/source`. History has its own `/history` entry route. The automation shell retains chat and its active skill context while switching these views through the browser's history, including Back and Forward.

On desktop, the viewport-height automation shell keeps navigation and chat stationary while the center workspace scrolls. Chat messages may scroll within their bounded message list, leaving the composer accessible. Small screens use dismissible navigation and chat drawers so the catalogue/editor remain the primary content. The public portfolio footer does not appear inside Utomator.

An unsaved MDX buffer survives visual/source switching. The visual graph cannot overwrite unapplied MDX accidentally, and leaving the editor through its All skill projects control asks for confirmation when edits are pending.

## Visual canvas and MDX

The persisted graph is canonical. The React Flow canvas permits dragging, connecting, reconnecting, unlinking and inspecting typed steps. A deterministic converter generates `SKILL.mdx` with YAML frontmatter, Markdown headings, a declarative `<SkillNode />` tag, and `Next` links. Editing the MDX source and selecting Apply parses it back to the same graph. This is a deliberately restricted MDX dialect; no MDX JavaScript is evaluated.

Cycles, dangling connections, duplicate step IDs and metadata that violates skill naming/trigger requirements are rejected. Changes are checked against the last saved version, preventing stale chat and canvas edits from overwriting one another.

## Packaging and portability

Export `.skill` is a ZIP-format **Utomator-specific extension** containing `<slug>/SKILL.md`, `<slug>/SKILL.mdx`, and `<slug>/graph.json`. The `.zip` action exports the same portable content under the standard ZIP extension. `SKILL.md` is the agent-facing, YAML-frontmatter entrypoint defined by Anthropic; `.mdx` and `graph.json` retain authoring details. Anthropic requires `SKILL.md` and does not define `.skill` as its native extension. Import supports Utomator `.mdx`, `.skill` and `.zip` bundles.

## Chat integration

Command examples:

```text
/skill help
/skill open content-series-planning
/skill add Cite one source | Verify the claim against the original evidence.
/skill link goal -> evidence
/skill unlink goal -> evidence
/skill rename My social research workflow
/skill description Researches factual posts. Use when the owner requests a source-checked social thread.
/skill enable
/skill disable
```

These commands mutate the same versioned skill graph as the canvas and MDX editor. The pre-existing `add skill:` message still means adding a LinkedIn profile skill and does not manipulate agent-skill projects.

## Safety and release criteria

Skills are instructions, not executable actions. The project must not imply autonomous content publishing, social commenting, or job applications while no model runtime is connected. Content and job workflows include explicit evidence and human-approval steps. The API remains local, with same-origin checks, body limits and allowlisted endpoints. Release requires TypeScript, unit/API tests, Next.js build, ZIP parse tests, browser workflow tests, mobile overflow checks, independent review and dogfood.

Reference: Anthropic, The Complete Guide to Building Skills for Claude, Fundamentals, Technical requirements, Testing and iteration, Distribution and sharing.
