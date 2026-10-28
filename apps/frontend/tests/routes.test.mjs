import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { join } from "node:path";
const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
test("operator pages are top-level and legacy portfolio routes are absent", async () => {
  for (const route of ["dashboard","editorial","growth","research","history","crafts","profile","resumes","observer","memory","settings"])
    assert.ok(existsSync(new URL("app/" + route + "/page.tsx",root)),route);
  for (const route of ["about","articles","projects","resume","library","_automate","%5Fautomate"])
    assert.ok(!existsSync(new URL("app/" + route,root)),route);
  assert.match(await read("app/page.tsx"),/HeroText/);
  assert.match(await read("components/home/hero-text.tsx"),/Utomator/);
  assert.match(await read("components/home/hero-button.tsx"),/href="\/dashboard"/);
});
test("API proxy enforces loopback and its method/path allowlist", async () => {
  const api = await read("app/api/[...path]/route.ts");
  assert.match(api,/allowedHost\(req\)/);
  assert.match(api,/permitted\(target, req.method\)/);
  assert.match(api,/127\.0\.0\.1:/);
  assert.match(api,/Same-origin request required/);
  assert.match(api,/\/api\/linkedin\/oauth\/callback/);
  assert.ok(!api.includes("/_automate"));
  assert.ok(api.includes('"crafts"'));
  assert.ok(!api.includes('"skills"'));
});
test("frontend no longer imports personal portfolio data", async () => {
  const layout = await read("app/layout.tsx");
  assert.ok(!layout.includes("@/lib/data"));
  assert.ok(!layout.includes("profileImage"));
  for (const p of ["components/navbar.tsx","components/footer.tsx","components/home/hero-text.tsx"])
    assert.ok(!(await read(p)).includes("Sodiq Oladejo"),p);
});
