import { expect, type Page, type Route } from "@playwright/test";

export type ProviderKey = "linkedin" | "x" | "instagram" | "github" | "devto";

export type ConnectorFixture = {
  id: string;
  platform: ProviderKey;
  label: string;
  handle: string;
  profileUrl: string;
  status: "connected" | "disconnected" | "sign-in-open" | "api-required";
  verifiedAt: string | null;
  authentication: "browser" | "api-required";
};

export const iso = {
  now: () => new Date().toISOString(),
  hoursAgo: (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString(),
};

let sequence = 0;

/** Deterministic connector row matching the backend `GET /connectors` response. */
export function connectorAccount(
  platform: ProviderKey,
  overrides: Partial<Omit<ConnectorFixture, "platform">> = {},
): ConnectorFixture {
  sequence += 1;
  const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  return {
    id: overrides.id ?? platform + "-" + sequence,
    platform,
    label: overrides.label ?? cap(platform) + " sample",
    handle: overrides.handle ?? (platform === "devto" ? "sample.dev" : "sample." + platform),
    profileUrl: overrides.profileUrl ?? "https://www." + (platform === "devto" ? "dev.to/" : platform + ".com/")
      + (platform === "linkedin" ? "in/" : "") + (platform === "devto" ? "sample.dev" : "sample." + platform),
    status: overrides.status ?? "disconnected",
    verifiedAt: overrides.verifiedAt ?? null,
    authentication: overrides.authentication ?? (platform === "linkedin" || platform === "x" ? "browser" : "api-required"),
  };
}

export const CONNECTORS_ROUTE = "**/api/connectors**";

/**
 * Open the connector dialog from the floating toolbar. The button exists in
 * the SSR HTML before React hydrates, so the first click can be a no-op;
 * retry until the dialog actually mounts.
 */
export async function openConnectorDialog(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const trigger = page.getByTestId("floating-connector-button");
  const wizard = page.getByRole("dialog", { name: "Connect your social accounts" });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await wizard.isVisible())) await trigger.click();
    await expect(wizard).toBeVisible();
  }).toPass({ timeout: 45_000 });
  return wizard;
}

export type ConnectorCommandEvent = { method: string; operation: string; id: string };

export type ConnectorBehavior =
  | { simulate: "hang" }
  | { respondAfter?: number; status?: number; body?: unknown }
  | undefined;

export type ConnectorApiMock = {
  /** Live account list served to the app (mutated by scripted responses). */
  accounts: ConnectorFixture[];
  /** Every intercepted request, including periodic GET polls. */
  requests: ConnectorCommandEvent[];
  /** POST commands only (connect / sync / disconnect). */
  commands: ConnectorCommandEvent[];
};
/**
 * Intercept `/api/connectors` so the dialog can be exercised without
 * the local engine or a real provider. GET answers with the live account list;
 * POST commands apply the matching state change and answer like the engine:
 * `connect` → sign-in-open, `sync` → connected, `disconnect` → disconnected.
 * A `behavior` callback can override any exchange (error payloads, slow
 * responses, hangs) and receives both GET and POST events.
 */
export async function installConnectorApi(
  page: Page,
  seed: ConnectorFixture[],
  behavior?: (event: ConnectorCommandEvent) => ConnectorBehavior,
): Promise<ConnectorApiMock> {
  const accounts = seed.map((account) => ({ ...account }));
  const requests: ConnectorCommandEvent[] = [];
  const commands: ConnectorCommandEvent[] = [];

  const respond = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {
      // The test may have aborted the in-flight request; fulfillment is moot.
    });

  const applyStatusChange = (body: unknown) => {
    const status = (body as { status?: string }).status;
    const id = (body as { id?: string }).id;
    const account = accounts.find((item) => item.id === id);
    if (!account) return;
    if (status === "connected") {
      account.status = "connected";
      account.verifiedAt = iso.now();
    } else if (status === "sign-in-open") {
      account.status = "sign-in-open";
    } else if (status === "disconnected") {
      account.status = "disconnected";
      account.verifiedAt = null;
    }
  };

  const defaultBody: Record<string, unknown> = {
    connect: { status: "sign-in-open", navigationWarning: "Mock provider sign-in is open in isolated Chrome. Finish signing in there - including any MFA or consent step - then choose Sync." },
    sync: { status: "connected" },
    disconnect: { status: "disconnected" },
  };

  await page.route(CONNECTORS_ROUTE, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split("/").filter(Boolean);
    try {
      if (request.method() === "GET") {
        const event: ConnectorCommandEvent = { method: "GET", operation: "", id: "" };
        requests.push(event);
        const custom = behavior?.(event);
        if (custom && "simulate" in custom) return; // request stays pending
        if (custom?.respondAfter) await new Promise((resolve) => setTimeout(resolve, custom.respondAfter));
        await respond(route, accounts, custom?.status ?? 200);
        return;
      }
      // POST path: /api/connectors/:id/:operation
      const id = path[3] ?? "";
      const operation = path[4] ?? "";
      const event: ConnectorCommandEvent = { method: request.method(), operation, id };
      requests.push(event);
      if (event.method !== "GET") commands.push(event);
      const custom = behavior?.(event);
      if (custom && "simulate" in custom) return;
      if (custom?.respondAfter) await new Promise((resolve) => setTimeout(resolve, custom.respondAfter));
      const body = custom?.body ?? defaultBody[operation] ?? {};
      if (!custom?.status || custom.status < 400) applyStatusChange({ ...(body as { status?: string }), id });
      await respond(route, body, custom?.status ?? 200);
    } catch {
      // Aborted fetches reject the fulfillment chain; the test has moved on.
    }
  });

  return {
    accounts,
    requests,
    commands,
  };
}
