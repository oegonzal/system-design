/**
 * A system-design prompt drafted from an engineer's experience: the artifact
 * is the structured draft in `@sysdesign/contracts`, so every line is a part
 * a lens can cite, and the studio renders the accepted draft to markdown with
 * the one renderer beside that schema. Ids are positional and engine-assigned.
 */
import { designPromptDraftSchema, type DesignPromptDraft } from '@sysdesign/contracts';

import type { OutputShape } from '../../core/contracts';

const numbered = <I>(prefix: string, items: readonly I[], label: (item: I) => string) =>
  items.map((item, index) => ({ id: `${prefix}.${index + 1}`, label: label(item) }));

const section = <I>(
  title: string,
  prefix: string,
  items: readonly I[],
  line: (item: I) => string,
): string[] =>
  items.length === 0
    ? []
    : ['', `## ${title}`, ...items.map((item, index) => `[${prefix}.${index + 1}] ${line(item)}`)];

export const designPromptOutput: OutputShape<DesignPromptDraft> = {
  schema: designPromptDraftSchema,

  locate: (draft) => [
    { id: 'title', label: 'Title' },
    { id: 'scenario', label: 'Scenario' },
    ...numbered('functional', draft.functionalRequirements, (item) => item),
    ...numbered(
      'nfr',
      draft.nonFunctionalRequirements,
      (item) => `${item.kind}: ${item.requirement}`,
    ),
    ...numbered('scale', draft.scale, (item) => item.metric),
    ...numbered('constraint', draft.constraints, (item) => item),
  ],

  render: (draft) =>
    [
      `[title] ${draft.title}`,
      `[scenario] ${draft.scenario}`,
      ...section(
        'Functional requirements',
        'functional',
        draft.functionalRequirements,
        (item) => item,
      ),
      ...section(
        'Non-functional requirements',
        'nfr',
        draft.nonFunctionalRequirements,
        (item) => `${item.kind} — ${item.requirement} — target: ${item.target}`,
      ),
      ...section('Scale targets', 'scale', draft.scale, (item) => `${item.metric}: ${item.target}`),
      ...section('Constraints', 'constraint', draft.constraints, (item) => item),
    ].join('\n'),
};
