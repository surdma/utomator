
import { test, expect } from 'vitest';
import { editCraftFromCommand } from '../components/dashboard/pipeline/craft-command-editor.ts';

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
  expect(() => editCraftFromCommand({ ...craft(), scope: 'default' }, 'enable')).toThrow(/read-only/);
  expect(() => editCraftFromCommand(craft(), 'publish all')).toThrow(/Unknown command/);
});

test('craft editor adds unique step IDs without mutating the original', () => {
  const original = craft();
  const result = editCraftFromCommand(
    original,
    'add Research | New instructions',
  );
  expect(result.expectedVersion).toEqual(7);
  expect(result.craft.steps.at(-1)?.id).toEqual('research-2');
  expect(result.craft.steps.at(-1)?.body).toEqual('New instructions');
  expect(original.steps.length).toEqual(2);
});

test('craft editor rejects missing endpoints and duplicate links', () => {
  expect(() => editCraftFromCommand(craft(), 'link research -> absent')).toThrow(/Both step IDs/);
  const linked = editCraftFromCommand(craft(), 'link research -> draft');
  expect(linked.craft.links.map((link) => link.id)).toEqual(['research-to-draft']);
  expect(() =>
      editCraftFromCommand(
        { ...craft(), links: linked.craft.links },
        'link research -> draft',
      )).toThrow(/already connected/);
  expect(editCraftFromCommand(
      { ...craft(), links: linked.craft.links },
      'unlink research -> draft',
    ).craft.links).toEqual([]);
});

test('craft editor preserves version and metadata edits', () => {
  expect(editCraftFromCommand(craft(), 'rename My new name').craft.name).toEqual('My new name');
  expect(editCraftFromCommand(craft(), 'description New description').craft
      .description).toEqual('New description');
  expect(editCraftFromCommand(craft(), 'enable').craft.enabled).toEqual(true);
  expect(editCraftFromCommand(craft(), 'disable').craft.enabled).toEqual(false);
});
