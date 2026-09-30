/**
 * A system-design prompt drafted from an engineer's experience: the artifact
 * is the structured draft in `@sysdesign/contracts`, so every line is a part
 * a lens can cite, and the studio renders the accepted draft to markdown with
 * the one renderer beside that schema. Ids are positional and engine-assigned.
 */
import { designPromptDraftSchema, type DesignPromptDraft } from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

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
      ...numberedSection(
        'Functional requirements',
        'functional',
        draft.functionalRequirements,
        (item) => item,
      ),
      ...numberedSection(
        'Non-functional requirements',
        'nfr',
        draft.nonFunctionalRequirements,
        (item) => `${item.kind} — ${item.requirement} — target: ${item.target}`,
      ),
      ...numberedSection(
        'Scale targets',
        'scale',
        draft.scale,
        (item) => `${item.metric}: ${item.target}`,
      ),
      ...numberedSection('Constraints', 'constraint', draft.constraints, (item) => item),
    ].join('\n'),
};
