import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  growthCapabilities,
  growthGuardrails,
  growthJourneys,
  profileSections,
} from '../../frontend/components/dashboard/growth/linkedin-growth-capabilities.js';

test('LinkedIn scope registry preserves all product modules without pretending full delivery', () => {
  assert.equal(growthCapabilities.length, 15);
  assert.equal(new Set(growthCapabilities.map((x) => x.id)).size, growthCapabilities.length);
  assert.equal(profileSections.length, 20);
  assert.equal(new Set(profileSections).size, 20);
  for (const item of growthCapabilities) {
    assert.ok(['P0', 'P1', 'P2'].includes(item.priority), item.id);
    assert.ok(['research', 'execution', 'measurement'].includes(item.pillar), item.id);
    assert.ok(['partial', 'planned'].includes(item.status), item.id);
    assert.ok(item.actions.length >= 5, item.id);
    assert.ok(
      item.summary.length > 20 && item.availableNow.length > 20 && item.requires.length > 20,
      item.id,
    );
    if (item.status === 'planned')
      assert.equal(
        item.route,
        undefined,
        'planned action must not link to phantom workflow: ' + item.id,
      );
  }
});
test('Working scope links only to actual local profile, research or editorial surfaces', () => {
  const partial = growthCapabilities.filter((x) => x.status === 'partial');
  assert.deepEqual(
    partial.map((x) => x.id),
    ['profile', 'competitors', 'content', 'branding'],
  );
  for (const module of partial) {
    assert.ok(module.route?.startsWith('/'), module.id);
    assert.ok(
      ['/dashboard/profile', '/dashboard/research', '/dashboard/editorial'].includes(module.route),
    );
  }
  assert.equal(growthCapabilities.find((x) => x.id === 'jobs')?.status, 'planned');
  assert.equal(growthCapabilities.find((x) => x.id === 'company')?.status, 'planned');
  assert.equal(growthCapabilities.find((x) => x.id === 'analytics')?.status, 'planned');
});
test('Goal journeys point to valid modules but never imply every stage is automated', () => {
  assert.equal(growthJourneys.length, 5);
  const ids = new Set(growthCapabilities.map((x) => x.id));
  for (const journey of growthJourneys) {
    assert.ok(journey.sequence.length >= 4);
    assert.ok(
      journey.sequence.every((id) => ids.has(id)),
      journey.id,
    );
    assert.ok(journey.outcome.length > 20);
  }
  assert.ok(growthGuardrails.some((x) => x.includes('scraping')));
  assert.ok(growthGuardrails.some((x) => x.includes('drafted message')));
});

test('Landing document preserves the seventeen sections of the supplied capability map', async () => {
  const content = await readFile(
    new URL('../docs/linkedin-growth-capability-map.md', import.meta.url),
    'utf8',
  );
  for (let chapter = 1; chapter <= 17; chapter++)
    assert.match(content, new RegExp('^## ' + chapter + '\\.', 'm'));
  assert.match(content, /source\/evidence and account goals/);
});
