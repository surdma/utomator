import assert from 'node:assert/strict';
import { test } from 'node:test';
import { craftCategoryTitles } from '../components/dashboard/crafts/craft-category-titles.ts';

test('Craft categories retain the six named catalogue sections', () => {
  assert.deepEqual(craftCategoryTitles, {
    presence: 'Professional presence',
    portfolio: 'Portfolio evidence',
    'job-hunt': 'Career research',
    applications: 'Applications',
    content: 'Editorial authority',
    engagement: 'Relationships',
  });
});
