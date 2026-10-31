import type { Draft } from './craft-types';

export function renderMdx(draft: Draft) {
  return (
    [
      '---',
      'name: ' + draft.slug,
      'description: ' + JSON.stringify(draft.description),
      'category: ' + draft.category,
      'enabled: ' + String(draft.enabled),
      '---',
      '',
      '# ' + draft.name,
      '',
      ...draft.steps.flatMap((step) => [
        '## Step: ' + step.id + ' | ' + step.title,
        '<a id="step-' + step.id + '" />',
        '<CraftNode kind="' +
          step.kind +
          '" x={' +
          step.position.x +
          '} y={' +
          step.position.y +
          '} />',
        '',
        step.body.trim(),
        '',
        '**Next:** ' +
          (draft.links
            .filter((link) => link.source === step.id)
            .map((link) => '[' + link.target + '](#step-' + link.target + ')')
            .join(', ') || 'End'),
        '',
      ]),
    ]
      .join('\n')
      .trimEnd() + '\n'
  );
}
