
import { test, expect } from 'vitest';
import { renderMdx } from '../components/dashboard/crafts/craft-mdx.ts';

test('craft source serialization preserves metadata and connected step links', () => {
  const source = renderMdx({
    slug: 'audience-growth',
    name: 'Audience Growth',
    description: 'Provenance-first research',
    category: 'content',
    enabled: false,
    steps: [
      {
        id: 'research',
        title: 'Find verified signals',
        kind: 'research',
        body: 'Collect observations.',
        position: { x: 25, y: 50 },
      },
      {
        id: 'draft',
        title: 'Draft a post',
        kind: 'draft',
        body: 'Use the collected data.',
        position: { x: 250, y: 50 },
      },
    ],
    links: [{ id: 'edge-1', source: 'research', target: 'draft' }],
  });
  expect(source).toMatch(/^---\nname: audience-growth\n/);
  expect(source).toMatch(/enabled: false/);
  expect(source).toMatch(/<CraftNode kind="research" x=\{25\} y=\{50\} \/>/);
  expect(source).toMatch(/\*\*Next:\*\* \[draft\]\(#step-draft\)/);
  expect(source).toMatch(/\*\*Next:\*\* End/);
});
