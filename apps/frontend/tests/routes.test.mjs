import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const pages = [
  "pipeline",
  "crafts",
  "editorial",
  "growth",
  "history",
  "memory",
  "observer",
  "profile",
  "research",
  "resumes",
  "settings",
];
test("the marketing root is separate and every operator page is nested under dashboard", async () => {
  assert.ok(existsSync(new URL("app/page.tsx", root)));
  assert.ok(existsSync(new URL("app/dashboard/page.tsx", root)));
  for (const route of pages)
    assert.ok(
      existsSync(new URL("app/dashboard/" + route + "/page.tsx", root)),
      route,
    );
  for (const route of [
    "workspace",
    "library",
    "crafts",
    "editorial",
    "history",
    "memory",
    "observer",
    "profile",
    "research",
    "resumes",
    "settings",
    "_automate",
    "%5Fautomate",
  ])
    assert.ok(!existsSync(new URL("app/" + route, root)), route);
  assert.ok(
    existsSync(new URL("app/dashboard/crafts/[craftId]/source/page.tsx", root)),
  );
  assert.ok(
    existsSync(new URL("app/dashboard/growth/[craftId]/page.tsx", root)),
  );
  assert.ok(
    existsSync(new URL("app/growth/default-growth-profile/page.tsx", root)),
  );
  assert.ok(
    existsSync(new URL("app/dashboard/growth/[craftId]/source/page.tsx", root)),
  );
  assert.ok(
    existsSync(new URL("app/dashboard/resumes/[resumeId]/page.tsx", root)),
  );
  assert.match(
    await read("app/dashboard/page.tsx"),
    /redirect\("\/dashboard\/pipeline"\)/,
  );
  assert.match(await read("components/automate/pipeline.tsx"), /Pipeline/);
  assert.match(
    await read("components/home/hero-button.tsx"),
    /href="\/dashboard\/pipeline"/,
  );
});
test("API proxy remains loopback-only and craft endpoints are allowlisted", async () => {
  const api = await read("app/api/[...path]/route.ts");
  assert.match(api, /allowedHost\(req\)/);
  assert.match(api, /permitted\(target, req.method\)/);
  assert.match(api, /127\.0\.0\.1:/);
  assert.match(api, /Same-origin request required/);
  assert.match(api, /\/api\/linkedin\/oauth\/callback/);
  assert.ok(!api.includes("/_automate"));
  assert.ok(api.includes('"crafts"'));
  assert.ok(!api.includes('"skills"'));
});
test("marketing content does not embed old personal portfolio identity", async () => {
  const layout = await read("app/layout.tsx");
  assert.ok(!layout.includes("@/lib/data"));
  assert.ok(!layout.includes("profileImage"));
  for (const path of [
    "components/navbar.tsx",
    "components/footer.tsx",
    "components/home/hero-text.tsx",
  ])
    assert.ok(!(await read(path)).includes("Sodiq Oladejo"), path);
});
