import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "app");
const routes = [
  "workspace", "growth", "editorial", "research", "history",
  "library", "memory", "observer", "profile", "resumes", "settings",
];

test("the operator pages live at the app root, not under an automation prefix", () => {
  assert.ok(existsSync(resolve(app, "page.tsx")));
  for (const route of routes) assert.ok(existsSync(resolve(app, route, "page.tsx")), route);
  assert.ok(existsSync(resolve(app, "api", "[...path]", "route.ts")));
  assert.ok(!existsSync(resolve(app, "%5Fautomate")));
  assert.ok(!existsSync(resolve(app, "_automate")));
});

test("public portfolio routes are absent", () => {
  for (const route of ["about", "articles", "projects", "resume"]) {
    assert.ok(!existsSync(resolve(app, route)), route);
  }
});

test("the proxy still rejects unsupported endpoints and non-local access", () => {
  const proxy = readFileSync(resolve(app, "api", "[...path]", "route.ts"), "utf8");
  assert.match(proxy, /function allowedHost/);
  assert.match(proxy, /function permitted/);
  assert.match(proxy, /Local automation only/);
  assert.match(proxy, /Unsupported endpoint/);
  assert.match(proxy, /same-origin|Same-origin/);
});

test("landing page and workspace identity are Utomator, not the portfolio", () => {
  const home = readFileSync(resolve(app, "page.tsx"), "utf8");
  const hero = readFileSync(resolve(root, "components", "home", "hero-text.tsx"), "utf8");
  assert.ok(!home.includes("ProfileAvatar"));
  assert.match(hero, /Utomator/);
  assert.match(home, /automation workflow preview/);
});
