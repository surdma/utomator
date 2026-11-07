# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connector-states.test.ts >> Compact LinkedIn dialog stays usable on narrow mobile viewports
- Location: tests\connector-states.test.ts:129:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByTestId('floating-connector-button')
Expected: visible
Received: hidden
Timeout:  12000ms

Call log:
  - Expect "toBeVisible" getByTestId('floating-connector-button') with timeout 12000ms
  - waiting for getByTestId('floating-connector-button')
    15 × locator resolved to <button type="button" aria-haspopup="dialog" title="Connect LinkedIn account" aria-label="Connect LinkedIn account" data-testid="floating-connector-button" class="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400">…</button>
       - unexpected value "hidden"
    11 × locator resolved to <button type="button" aria-haspopup="dialog" aria-label="Manage LinkedIn account" data-testid="floating-connector-button" title="LinkedIn connected · Manage or sync" class="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400">…</button>
       - unexpected value "hidden"

```

```yaml
- paragraph: Utomator / Studio
- paragraph: Local automation, evidence first
- status "Engine connected"
- button "Account menu"
- main:
  - text: Artboard / No workflow selected
  - button "Templates"
  - paragraph: Your workspace
  - heading "Start with a clear canvas" [level=2]
  - paragraph: Choose a workflow from the library or build your own. The canvas stays empty until you choose to open or create a workflow.
  - button "Browse templates"
  - button "Create new workflow"
  - paragraph: New executable workflows begin with the four required Runner stages. You can add and configure steps before saving.
  - text: Continue a saved workflow
  - button "Profile baseline and evidence 11 steps · Revision 1"
  - button "Profile baseline and evidence 11 steps · Revision 1"
  - button "Section-specific profile audit 10 steps · Revision 1"
  - button "Profile baseline and evidence 11 steps · Revision 1"
- button "Workspace"
- button "Run history"
- button "Account"
- button "Résumés"
- button "Start workflow": Run workflow
- button "Intelligence"
- button "Creator research"
- button "Editorial drafts"
- button "Growth"
- button "Open Mator": Mator
- alert
```

# Test source

```ts
  1   | import { expect, type Page, type Route } from '@playwright/test';
  2   | 
  3   | export type ProviderKey = 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
  4   | 
  5   | export type ConnectorFixture = {
  6   |   id: string;
  7   |   platform: ProviderKey;
  8   |   label: string;
  9   |   handle: string;
  10  |   profileUrl: string;
  11  |   status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  12  |   verifiedAt: string | null;
  13  |   authentication: 'browser' | 'api-required';
  14  | };
  15  | 
  16  | export const iso = {
  17  |   now: () => new Date().toISOString(),
  18  |   hoursAgo: (hours: number) =>
  19  |     new Date(Date.now() - hours * 3_600_000).toISOString(),
  20  | };
  21  | 
  22  | let sequence = 0;
  23  | 
  24  | /** Deterministic connector row matching the backend `GET /connectors` response. */
  25  | export function connectorAccount(
  26  |   platform: ProviderKey,
  27  |   overrides: Partial<Omit<ConnectorFixture, 'platform'>> = {},
  28  | ): ConnectorFixture {
  29  |   sequence += 1;
  30  |   const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  31  |   return {
  32  |     id: overrides.id ?? `${platform}-${sequence}`,
  33  |     platform,
  34  |     label: overrides.label ?? `${cap(platform)} sample`,
  35  |     handle:
  36  |       overrides.handle ??
  37  |       (platform === 'devto' ? 'sample.dev' : `sample.${platform}`),
  38  |     profileUrl:
  39  |       overrides.profileUrl ??
  40  |       'https://www.' +
  41  |         (platform === 'devto' ? 'dev.to/' : `${platform}.com/`) +
  42  |         (platform === 'linkedin' ? 'in/' : '') +
  43  |         (platform === 'devto' ? 'sample.dev' : `sample.${platform}`),
  44  |     status: overrides.status ?? 'disconnected',
  45  |     verifiedAt: overrides.verifiedAt ?? null,
  46  |     authentication:
  47  |       overrides.authentication ??
  48  |       (platform === 'linkedin' || platform === 'x'
  49  |         ? 'browser'
  50  |         : 'api-required'),
  51  |   };
  52  | }
  53  | 
  54  | export const CONNECTORS_ROUTE = '**/api/connectors**';
  55  | 
  56  | /**
  57  |  * Open the connector dialog from the floating toolbar. The button exists in
  58  |  * the SSR HTML before React hydrates, so the first click can be a no-op;
  59  |  * retry until the dialog actually mounts.
  60  |  */
  61  | export async function openConnectorDialog(page: Page) {
  62  |   await page.goto('/dashboard/pipeline', { waitUntil: 'domcontentloaded' });
  63  |   const trigger = page.getByTestId('floating-connector-button');
  64  |   const wizard = page.getByRole('dialog', {
  65  |     name: 'Connect your social accounts',
  66  |   });
> 67  |   await expect(trigger).toBeVisible();
      |                         ^ Error: expect(locator).toBeVisible() failed
  68  |   await expect(async () => {
  69  |     if (!(await wizard.isVisible())) await trigger.click();
  70  |     await expect(wizard).toBeVisible();
  71  |   }).toPass({ timeout: 45_000 });
  72  |   return wizard;
  73  | }
  74  | 
  75  | export type ConnectorCommandEvent = {
  76  |   method: string;
  77  |   operation: string;
  78  |   id: string;
  79  | };
  80  | 
  81  | export type ConnectorBehavior =
  82  |   | { simulate: 'hang' }
  83  |   | { respondAfter?: number; status?: number; body?: unknown }
  84  |   | undefined;
  85  | 
  86  | export type ConnectorApiMock = {
  87  |   /** Live account list served to the app (mutated by scripted responses). */
  88  |   accounts: ConnectorFixture[];
  89  |   /** Every intercepted request, including periodic GET polls. */
  90  |   requests: ConnectorCommandEvent[];
  91  |   /** POST commands only (connect / sync / disconnect). */
  92  |   commands: ConnectorCommandEvent[];
  93  | };
  94  | /**
  95  |  * Intercept `/api/connectors` so the dialog can be exercised without
  96  |  * the local engine or a real provider. GET answers with the live account list;
  97  |  * POST commands apply the matching state change and answer like the engine:
  98  |  * `connect` → sign-in-open, `sync` → connected, `disconnect` → disconnected.
  99  |  * A `behavior` callback can override any exchange (error payloads, slow
  100 |  * responses, hangs) and receives both GET and POST events.
  101 |  */
  102 | export async function installConnectorApi(
  103 |   page: Page,
  104 |   seed: ConnectorFixture[],
  105 |   behavior?: (event: ConnectorCommandEvent) => ConnectorBehavior,
  106 | ): Promise<ConnectorApiMock> {
  107 |   const accounts = seed.map((account) => ({ ...account }));
  108 |   const requests: ConnectorCommandEvent[] = [];
  109 |   const commands: ConnectorCommandEvent[] = [];
  110 | 
  111 |   const respond = (route: Route, body: unknown, status = 200) =>
  112 |     route
  113 |       .fulfill({
  114 |         status,
  115 |         contentType: 'application/json',
  116 |         body: JSON.stringify(body),
  117 |       })
  118 |       .catch(() => {
  119 |         // The test may have aborted the in-flight request; fulfillment is moot.
  120 |       });
  121 | 
  122 |   const applyStatusChange = (body: unknown) => {
  123 |     const status = (body as { status?: string }).status;
  124 |     const id = (body as { id?: string }).id;
  125 |     const account = accounts.find((item) => item.id === id);
  126 |     if (!account) return;
  127 |     if (status === 'connected') {
  128 |       account.status = 'connected';
  129 |       account.verifiedAt = iso.now();
  130 |       if (!account.handle) {
  131 |         account.handle = 'verified-owner';
  132 |         account.label = 'verified-owner';
  133 |         account.profileUrl =
  134 |           account.platform === 'linkedin'
  135 |             ? 'https://www.linkedin.com/in/verified-owner/'
  136 |             : 'https://x.com/verified-owner';
  137 |       }
  138 |     } else if (status === 'sign-in-open') {
  139 |       account.status = 'sign-in-open';
  140 |     } else if (status === 'disconnected') {
  141 |       account.status = 'disconnected';
  142 |       account.verifiedAt = null;
  143 |     }
  144 |   };
  145 | 
  146 |   const defaultBody: Record<string, unknown> = {
  147 |     connect: {
  148 |       status: 'sign-in-open',
  149 |       navigationWarning:
  150 |         'Mock provider sign-in is open in isolated Chrome. Finish signing in there - including any MFA or consent step - then choose Sync.',
  151 |     },
  152 |     sync: { status: 'connected' },
  153 |     check: { status: 'sign-in-open' },
  154 |     disconnect: { status: 'disconnected' },
  155 |   };
  156 | 
  157 |   await page.route(CONNECTORS_ROUTE, async (route) => {
  158 |     const request = route.request();
  159 |     const path = new URL(request.url()).pathname.split('/').filter(Boolean);
  160 |     try {
  161 |       if (request.method() === 'GET' && path[2] === 'capabilities') {
  162 |         await respond(route, {
  163 |           browserAvailable: true,
  164 |           mode: 'isolated',
  165 |           mobileBrowserSession: false,
  166 |         });
  167 |         return;
```