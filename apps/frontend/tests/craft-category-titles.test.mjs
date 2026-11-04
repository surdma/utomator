
import { test, expect } from 'vitest';
import { craftCategoryTitles } from '../components/dashboard/crafts/craft-category-titles.ts';

test('Craft categories retain the six named catalogue sections', () => {
  expect(craftCategoryTitles).toEqual({
    presence: 'Professional presence',
    portfolio: 'Portfolio evidence',
    'job-hunt': 'Career research',
    applications: 'Applications',
    content: 'Editorial authority',
    engagement: 'Relationships',
  });
});
