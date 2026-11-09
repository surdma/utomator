# Utomator operator studio

The operator is one person running their own LinkedIn work from this machine. The interface is a desktop-first studio for Growth, Craft, Pipeline, and Run evidence, usable at 320px.

## DESIGN SYSTEM (REQUIRED)

Platform: web, desktop-first, usable at 320px.
Theme: light only. `color-scheme: light`. No dark theme.

- Page Canvas (#f5f7f8) for the studio background
- Card Surface (#ffffff) for cards and dialogs
- Secondary Surface (#f1f5f9) for inset wells
- Card Hover (#f8fafc) for a hovered card
- Hairline (#e2e8f0) for borders
- Ink (#0f172a) for primary text
- Body Ink (#475569) for secondary text
- Quiet Ink (#64748b) for muted text and scrollbar thumbs
- Signal Cyan (#06b6d4) for the one action accent
- Review Violet (#8b5cf6) for review and annotation marks
- Exception Pink (#ec4899) for a destructive or exception mark
- Selection Wash (rgba(6, 182, 212, 0.3)) for text selection
- Landing Glass (rgba(255, 255, 255, 0.7)) for the marketing landing page only
- Landing Gradient Start (#0891b2) and Landing Gradient End (#0f766e) for landing headlines only

Type: Inter for UI, JetBrains Mono for evidence and labels. No second UI font.

## Typography

Deliberate risk: section labels are mono and uppercase. Everything else stays Inter.

- Display: Inter, 28px, weight 560, line-height 32px, letter-spacing -0.02em. Use once per page.
- Body: Inter, 14px, weight 400, line-height 20px.
- Label: JetBrains Mono, 11px, weight 500, line-height 16px, uppercase, letter-spacing 0.08em.
- Mono: JetBrains Mono, 13px, weight 400, line-height 18px. Run ids, routes, and evidence quotes.

## Spacing, radius, elevation, focus, motion

- Space scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: control 12px, card 16px, pill 999px.
- Elevation: card shadow `0 8px 32px rgba(0, 0, 0, 0.08)` on hover only.
- Focus ring: 2px solid Signal Cyan (#06b6d4), offset 2px.
- Motion: 180ms ease for color and transform. Honor `prefers-reduced-motion: reduce` by setting animation and transition duration to 0.01ms.

## Components

- Navigation: `flex min-h-11 items-center gap-2 px-3 text-sm text-(--text-secondary)`.
- Page header: label utility plus display type. One display title per page.
- Card: `rounded-2xl border border-(--border) bg-(--bg-card) p-4`.
- Button: existing `.site-action`. Primary fill is Ink (#0f172a) with white text. Secondary is Card Surface with Hairline.
- Input: `min-h-11 rounded-xl border border-(--border) bg-white px-3 text-sm text-(--text-primary)`.
- Dialog: Card Surface, radius 16px, Hairline border, no blur.
- Toast: Card Surface, Hairline, Body type.
- Empty state: Quiet Ink body copy and one secondary button. Say what is absent.
- Error state: Exception Pink (#ec4899) for the mark, Ink for the message. A blocked run stays blocked.

## Do and don't

- Do take color, type, radius, and motion from this file.
- Do update this file and `apps/frontend/app/globals.css` in the same change when the look changes.
- Don't add an accent color inside a feature module.
- Don't add a second font.
- Don't add glass, blur, or a gradient in a feature module. Landing Glass and the landing gradients are landing-only.
- Don't imply a draft was published, a proposal was saved on the provider, or a blocked run succeeded.

## Product words

- Growth: why this program exists. UI label: Growth.
- Craft: how a step is authored. UI label: Craft.
- Pipeline: a validated, frozen, account-bound release. UI label: Pipeline.
- Run: one authorized execution with checkpoints. UI label: Run.
- Approval: a human decision that a mutating step still needs. UI label: Approval. A pending approval is not a completed action.
