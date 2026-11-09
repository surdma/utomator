import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import {
  growthCapabilities,
  growthGuardrails,
  growthJourneys,
  profileSections,
} from '../../frontend/modules/growth/components/linkedin-growth-capabilities.js';

test('LinkedIn scope registry preserves all product modules without pretending full delivery', () => {
  expect(growthCapabilities.length).toEqual(15);
  expect(new Set(growthCapabilities.map((x) => x.id)).size).toEqual(growthCapabilities.length);
  expect(profileSections.length).toEqual(20);
  expect(new Set(profileSections).size).toEqual(20);
  for (const item of growthCapabilities) {
    expect(['P0', 'P1', 'P2'].includes(item.priority)).toBeTruthy();
    expect(['research', 'execution', 'measurement'].includes(item.pillar)).toBeTruthy();
    expect(['partial', 'planned'].includes(item.status)).toBeTruthy();
    expect(item.actions.length >= 5).toBeTruthy();
    expect(
      item.summary.length > 20 && item.availableNow.length > 20 && item.requires.length > 20,
    ).toBeTruthy();
    if (item.status === 'planned') expect(item.route).toEqual(undefined);
  }
});
test('Working scope links only to actual local profile, research or editorial surfaces', () => {
  const partial = growthCapabilities.filter((x) => x.status === 'partial');
  expect(partial.map((x) => x.id)).toEqual(['profile', 'competitors', 'content', 'branding']);
  for (const module of partial) {
    expect(module.route?.startsWith('/')).toBeTruthy();
    expect(
      ['/dashboard/profile', '/dashboard/research', '/dashboard/editorial'].includes(module.route),
    ).toBeTruthy();
  }
  expect(growthCapabilities.find((x) => x.id === 'jobs')?.status).toEqual('planned');
  expect(growthCapabilities.find((x) => x.id === 'company')?.status).toEqual('planned');
  expect(growthCapabilities.find((x) => x.id === 'analytics')?.status).toEqual('planned');
});
test('Goal journeys point to valid modules but never imply every stage is automated', () => {
  expect(growthJourneys.length).toEqual(5);
  const ids = new Set(growthCapabilities.map((x) => x.id));
  for (const journey of growthJourneys) {
    expect(journey.sequence.length >= 4).toBeTruthy();
    expect(journey.sequence.every((id) => ids.has(id))).toBeTruthy();
    expect(journey.outcome.length > 20).toBeTruthy();
  }
  expect(growthGuardrails.some((x) => x.includes('scraping'))).toBeTruthy();
  expect(growthGuardrails.some((x) => x.includes('drafted message'))).toBeTruthy();
});

test('Landing document preserves the seventeen sections of the supplied capability map', async () => {
  const content = await readFile(
    new URL('../docs/linkedin-growth-capability-map.md', import.meta.url),
    'utf8',
  );
  for (let chapter = 1; chapter <= 17; chapter++)
    expect(content).toMatch(new RegExp('^## ' + chapter + '\\.', 'm'));
  expect(content).toMatch(/source\/evidence and account goals/);
});
