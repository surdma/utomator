# Frontend browser quality gate

This project runs the production Next.js frontend in real Playwright browsers. The separate
**Frontend responsive and accessibility quality gate** GitHub Actions job runs for PRs touching the
frontend and for pushes to the configured branches.

## What CI covers

- Desktop Chromium (1440x900), Chromium tablet (768x1024), compact Android emulation (320x568),
  mobile landscape (667x375) and iPhone 13 WebKit emulation.
- Provider-selection, connected, unsupported and network-error states of the connector dialog.
- Horizontal overflow, buttons outside the viewport, and minimum 44x44 CSS-pixel targets.
- Keyboard focus staying inside the open native dialog and Escape dismissal.
- axe-core automated WCAG 2.0/2.1/2.2 A and AA rules over the connector dialog.
- Playwright screenshots of the key UI states, saved in the HTML report alongside the axe reports.
  Failed attempts retain traces, videos and screenshots.

The separate **integration** job continues to run backend and connector interaction tests. Connector
UI browser tests are fixture-backed: the provider API responses are mocked intentionally. They **do
not** prove real provider OAuth, login, desktop CDP or end-to-end mobile authentication works.

## Run locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @utomator/frontend exec playwright install chromium webkit
pnpm --filter @utomator/frontend test:ui
pnpm --filter @utomator/frontend test:browser
```

Local Playwright starts Next.js in dev mode automatically unless the server already exists. To test
a production build, build and start Next.js on port 3100 and run:

```sh
CI=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @utomator/frontend test:ui
```

## Reviewing a PR

Open the `frontend-ui-quality-evidence` artifact on the GitHub Actions run. Open
`playwright-report/index.html` to inspect screenshots for every viewport and state. Review awkward
wrapping, content density, primary action prominence, visually hidden controls and clarity of the
copy; the layout assertions alone cannot judge those product qualities.

Axe cannot guarantee full accessibility: do a manual screen-reader and keyboard review for critical
changes. WebKit emulation on Linux is not a physical iPhone. The 44px check is a chosen
product-quality threshold, not a universal WCAG rule.

For future pixel-diff regression testing, approve and check in stable screenshot baselines after the
UI has been visually reviewed. This suite deliberately does not fabricate a visual baseline from the
unreviewed connector design.
