import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  assert.match(source, /^---\nname: audience-growth\n/);
  assert.match(source, /enabled: false/);
  assert.match(source, /<CraftNode kind="research" x=\{25\} y=\{50\} \/>/);
  assert.match(source, /\*\*Next:\*\* \[draft\]\(#step-draft\)/);
  assert.match(source, /\*\*Next:\*\* End/);
});
