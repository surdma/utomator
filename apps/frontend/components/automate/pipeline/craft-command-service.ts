import type { Craft } from '../crafts-library';
import { getApi } from './api-client.ts';
import { editCraftFromCommand } from './craft-command-editor.ts';

type CraftCommandResult =
  | { kind: 'list'; notice: string }
  | { kind: 'open' | 'updated'; id: string; slug: string; notice: string };

export async function executeCraftCommand(
  text: string,
  selectedCraftId: string | null
): Promise<CraftCommandResult> {
  const command = text
    .trim()
    .replace(/^\/?craft\s*/i, '')
    .trim();
  const response = await fetch(getApi('crafts'), { cache: 'no-store' });
  if (!response.ok)
    throw Error('Craft library is unavailable; start the local API');
  const library = (await response.json()) as Craft[];

  if (/^(?:crafts|list|help)?$/i.test(command)) {
    return {
      kind: 'list',
      notice:
        'Crafts opened. Commands: /craft open <slug>; /craft add <title> | <instructions>; /craft link <from> -> <to>; /craft unlink <from> -> <to>; /craft rename <name>; /craft enable; /craft disable. You can also edit visually or in MDX.',
    };
  }

  const opening = command.match(/^open\s+([a-z0-9-]+)$/i);
  if (opening) {
    const wanted = library.find((item) => item.slug === opening[1]);
    if (!wanted) throw Error('No craft matches the slug ' + opening[1]);
    return {
      kind: 'open',
      id: wanted.id,
      slug: wanted.slug,
      notice:
        'Opened ' +
        wanted.name +
        ' in the craft editor. Select nodes or drag handles to rewire, then save.',
    };
  }

  const chosen = library.find((item) => item.id === selectedCraftId);
  if (!chosen) throw Error('Select a craft in Crafts first.');
  const { expectedVersion, craft } = editCraftFromCommand(chosen, command);
  const responseSave = await fetch(getApi('crafts/' + chosen.id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion, craft }),
  });
  const saved = (await responseSave.json()) as Craft & { error?: string };
  if (!responseSave.ok)
    throw Error(saved.error || 'Craft edit was rejected');
  return {
    kind: 'updated',
    id: saved.id,
    slug: saved.slug,
    notice:
      'Updated ' +
      saved.name +
      ' · v' +
      saved.version +
      '. The graph and MDX source now share this revision.',
  };
}
