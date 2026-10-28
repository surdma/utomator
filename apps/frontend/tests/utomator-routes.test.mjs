import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "app");
const routes = [
  "pipeline", "growth", "editorial", "research", "history",
  "crafts", "memory", "observer", "profile", "resumes", "settings",
];

test("operator pages live under dashboard, not at the app root", () => {
  assert.ok(existsSync(resolve(app, "page.tsx")));
  for (const route of routes) assert.ok(existsSync(resolve(app, "dashboard", route, "page.tsx")), route);
  assert.ok(existsSync(resolve(app, "api", "[...path]", "route.ts")));
  assert.ok(!existsSync(resolve(app, "%5Fautomate")));
  for(const route of routes)assert.ok(!existsSync(resolve(app,route)));
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
  assert.ok(proxy.includes('headers: body?.length ?'), 'bodyless clone POST does not advertise JSON');
  assert.match(proxy, /same-origin|Same-origin/);
});

test("landing page and pipeline identity are Utomator, not the portfolio", () => {
  const home = readFileSync(resolve(app, "page.tsx"), "utf8");
  const hero = readFileSync(resolve(root, "components", "home", "hero-text.tsx"), "utf8");
  assert.ok(!home.includes("ProfileAvatar"));
  assert.match(hero, /Utomator/);
  assert.match(home, /automation workflow preview/);
});

test("craft editor reads the ID from /dashboard/crafts/:id", () => {
  const pipeline = readFileSync(resolve(root, "components", "automate", "pipeline.tsx"), "utf8");
  assert.match(pipeline, /const id=pathname\.split\("\/"\)\[3\]/);
  assert.ok(!pipeline.includes('const id=pathname.split("/")[2]'));
});

test("dashboard navigation is distinct from account and career API paths", () => {
  const account=readFileSync(resolve(root,"components","automate","account-studio.tsx"),"utf8");
  const career=readFileSync(resolve(root,"components","automate","career-studio.tsx"),"utf8");
  assert.ok(account.includes('save("/profile","PUT",profile)'), "account settings use /api/account/profile");
  assert.ok(career.includes('request(sourceView?"/profile":"/resumes/"'), "career editor uses /api/career/profile or /api/career/resumes");
  assert.ok(career.includes('request("/resumes","POST"'), "creating a résumé uses the backend API");
  assert.ok(account.includes('"/dashboard/profile/connections"'), "navigation still lives inside dashboard");
});
