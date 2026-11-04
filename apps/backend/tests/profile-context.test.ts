
import { test, expect } from 'vitest';
import { loadOwnerContext } from '../src/profile/profile-context.js';

test('context comes from the current portfolio, resume and evidence', async () => {
  const context = await loadOwnerContext();
  expect((context.portfolio.siteConfig as { fullName: string }).fullName).toEqual('Sodiq Opeyemi Oladejo');
  expect((context.portfolio.socialLinks as { twitter: string }).twitter).toEqual('https://x.com/surdma');
  expect(Array.isArray(context.portfolio.projects)).toBeTruthy();
  expect(context.portfolio.projects.length > 6).toBeTruthy();
  expect(Array.isArray(context.resume.resumeExperience)).toBeTruthy();
  expect(context.resume.resumeExperience.length >= 6).toBeTruthy();
  expect(context.evidence.portfolio).toMatch(/SabiGo/);
  expect(Array.isArray(context.about.technologyGroups)).toBeTruthy();
});
