/**
 * A system-design prompt drafted from an engineer's experience: the artifact
 * is the structured draft in `@sysdesign/contracts`, so every line is a part
 * a lens can cite, and the studio renders the accepted draft to markdown with
 * the one renderer beside that schema. Ids are positional and engine-assigned;
 * the sections are the contract's declared table, iterated, never named.
 */
import {
  designPromptDraftSchema,
  DRAFT_SECTION_KEYS,
  DRAFT_SECTIONS,
  draftRows,
  sectionCells,
  type DesignPromptDraft,
} from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

/** A row as a lens reads it: its cells, a blank cell named as such so a target left out is visible. */
const line = (cells: readonly string[]): string =>
  cells.map((cell) => (cell.trim().length === 0 ? '(none given)' : cell.trim())).join(' — ');

export const designPromptOutput: OutputShape<DesignPromptDraft> = {
  schema: designPromptDraftSchema,

  locate: (draft) => [
    { id: 'title', label: 'Title' },
    { id: 'scenario', label: 'Scenario' },
    ...DRAFT_SECTION_KEYS.flatMap((key) =>
      numbered(DRAFT_SECTIONS[key].locationPrefix, draftRows(draft, key), (row) =>
        sectionCells(key, row)
          .filter((cell) => cell.trim().length > 0)
          .slice(0, 2)
          .join(': '),
      ),
    ),
  ],

  render: (draft) =>
    [
      `[title] ${draft.title}`,
      `[scenario] ${draft.scenario}`,
      ...DRAFT_SECTION_KEYS.flatMap((key) =>
        numberedSection(
          DRAFT_SECTIONS[key].heading.replace(/^#+\s*/, ''),
          DRAFT_SECTIONS[key].locationPrefix,
          draftRows(draft, key),
          (row) => line(sectionCells(key, row)),
        ),
      ),
    ].join('\n'),
};
