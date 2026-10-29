import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOwnerContext } from '../src/profile/context.js';

test('context comes from the current portfolio, resume and evidence', async () => {
  const context = await loadOwnerContext();
  assert.equal(
    (context.portfolio.siteConfig as { fullName: string }).fullName,
    'Sodiq Opeyemi Oladejo'
  );
  assert.equal(
    (context.portfolio.socialLinks as { twitter: string }).twitter,
    'https://x.com/surdma'
  );
  assert.ok(Array.isArray(context.portfolio.projects));
  assert.ok(context.portfolio.projects.length > 6);
  assert.ok(Array.isArray(context.resume.resumeExperience));
  assert.ok(context.resume.resumeExperience.length >= 6);
  assert.match(context.evidence.portfolio, /SabiGo/);
  assert.ok(Array.isArray(context.about.technologyGroups));
});
