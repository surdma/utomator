import type { Craft } from '../crafts-library';

export function editCraftFromCommand(chosen: Craft, command: string) {
  if (chosen.scope === 'default')
    throw Error(
      'This shared craft is read-only. Clone it to create your own editable version.'
    );
  const draft = {
    slug: chosen.slug,
    name: chosen.name,
    description: chosen.description,
    category: chosen.category,
    enabled: chosen.enabled,
    steps: chosen.steps.map((item) => ({ ...item })),
    links: chosen.links.map((item) => ({ ...item })),
  };
  const addition = command.match(/^add\s+([^|]+)\|\s*([\s\S]+)$/i);
  const link = command.match(
    /^(link|unlink)\s+([a-z0-9-]+)\s*->\s*([a-z0-9-]+)$/i
  );
  const rename = command.match(/^rename\s+(.+)$/i);
  const description = command.match(/^description\s+([\s\S]+)$/i);
  if (addition) {
    const title = addition[1]!.trim().slice(0, 100);
    const idBase = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 45);
    if (!idBase) throw Error('Specify an alphanumeric step title.');
    let id = idBase,
      number = 2;
    while (draft.steps.some((item) => item.id === id))
      id = idBase + '-' + number++;
    draft.steps.push({
      id,
      title,
      kind: 'draft',
      body: addition[2]!.trim().slice(0, 8000),
      position: {
        x: 70 + draft.steps.length * 180,
        y: 220 + (draft.steps.length % 3) * 140,
      },
    });
  } else if (link) {
    const source = link[2]!,
      target = link[3]!,
      id = source + '-to-' + target;
    if (
      !draft.steps.some((item) => item.id === source) ||
      !draft.steps.some((item) => item.id === target)
    )
      throw Error('Both step IDs must exist in the selected craft.');
    if (link[1]!.toLowerCase() === 'link') {
      if (draft.links.some((item) => item.id === id))
        throw Error('These steps are already connected.');
      draft.links.push({ id, source, target });
    } else {
      if (!draft.links.some((item) => item.id === id))
        throw Error('The connection does not exist.');
      draft.links = draft.links.filter((item) => item.id !== id);
    }
  } else if (rename) {
    draft.name = rename[1]!.trim().slice(0, 100);
  } else if (description) {
    draft.description = description[1]!.trim().slice(0, 1023);
  } else if (/^(enable|disable)$/i.test(command)) {
    draft.enabled = command.toLowerCase() === 'enable';
  } else
    throw Error('Unknown command. Try /craft help to see supported edits.');
  return { expectedVersion: chosen.version, craft: draft };
}
