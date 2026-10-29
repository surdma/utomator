import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editCraftFromCommand } from '../components/automate/pipeline/craft-command-editor.ts';

const craft = () => ({
  id: 'craft-one',
  slug: 'candidate-profile',
  name: 'Candidate',
  description: 'Original',
  category: 'portfolio',
  enabled: false,
  version: 7,
  updatedAt: '2026-10-29',
  scope: 'personal',
  steps: [
    {
      id: 'research',
      kind: 'research',
      title: 'Research',
      body: '',
      position: { x: 0, y: 0 },
    },
    {
      id: 'draft',
      kind: 'draft',
      title: 'Draft',
      body: '',
      position: { x: 100, y: 100 },
    },
  ],
  links: [],
});

test('craft editor refuses shared defaults and unknown commands', () => {
  assert.throws(
    () => editCraftFromCommand({ ...craft(), scope: 'default' }, 'enable'),
    /read-only/
  );
  assert.throws(
    () => editCraftFromCommand(craft(), 'publish all'),
    /Unknown command/
  );
});

test('craft editor adds unique step IDs without mutating the original', () => {
  const original = craft();
  const result = editCraftFromCommand(
    original,
    'add Research | New instructions'
  );
  assert.equal(result.expectedVersion, 7);
  assert.equal(result.craft.steps.at(-1)?.id, 'research-2');
  assert.equal(result.craft.steps.at(-1)?.body, 'New instructions');
  assert.equal(original.steps.length, 2);
});

test('craft editor rejects missing endpoints and duplicate links', () => {
  assert.throws(
    () => editCraftFromCommand(craft(), 'link research -> absent'),
    /Both step IDs/
  );
  const linked = editCraftFromCommand(craft(), 'link research -> draft');
  assert.deepEqual(
    linked.craft.links.map((link) => link.id),
    ['research-to-draft']
  );
  assert.throws(
    () =>
      editCraftFromCommand(
        { ...craft(), links: linked.craft.links },
        'link research -> draft'
      ),
    /already connected/
  );
  assert.deepEqual(
    editCraftFromCommand(
      { ...craft(), links: linked.craft.links },
      'unlink research -> draft'
    ).craft.links,
    []
  );
});

test('craft editor preserves version and metadata edits', () => {
  assert.equal(
    editCraftFromCommand(craft(), 'rename My new name').craft.name,
    'My new name'
  );
  assert.equal(
    editCraftFromCommand(craft(), 'description New description').craft
      .description,
    'New description'
  );
  assert.equal(editCraftFromCommand(craft(), 'enable').craft.enabled, true);
  assert.equal(editCraftFromCommand(craft(), 'disable').craft.enabled, false);
});
