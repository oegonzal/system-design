import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { declaredSection } from './mission-sections';
import type { ObservedElement } from './observation.schema';

/**
 * Marks: what a mission declares the page writes on an item it passes over.
 *
 * A results list writes an item's state into the item's own text — "Applied",
 * "Sold out", "Read" — and an accessible name that is the whole card carries
 * that word among a hundred others. Measured 2026-10-07, five times over two
 * live sessions and three replays: a planner told in prose to pass over a card
 * whose name carries "Applied" read the words on both sides of it and clicked
 * the card anyway, and the judges agreed with it. So the mission declares the
 * word as data, under its own `## Marks` heading, one bullet per mark:
 *
 *     ## Marks
 *
 *     - "Applied ·": applied to before.
 *
 * The engine never names a word. It renders the mark beside every element
 * whose name or words carry the token, writes it into the step index, and the
 * limits validator refuses a touch on a marked element the way it refuses one
 * on an element the page hides. What a mark means is the bullet's own prose,
 * read by the planner in the mission itself and carried nowhere else. A
 * mission that declares no marks declares none, and nothing here runs.
 */

export const MARKS_HEADING = '## Marks';
/** The most marks a mission declares; a mark is a state word, and a page has few. */
export const MARKS_BOUND = bound(8, 'list');
export const MARK_TOKEN_MAX_LENGTH = 60;

const markSchema = z.strictObject({
  /** The exact text the page writes on a marked item, matched as written. */
  token: bounded.id(MARK_TOKEN_MAX_LENGTH, { min: 1 }),
});
export type Mark = z.infer<typeof markSchema>;

/** One bullet of the Marks section: the token in double quotes, a colon, what it means. */
const MARK_LINE = /^- "(?<token>[^"]+)": .+$/;

/** A Marks bullet the grammar does not read; the mission is refused before any page is, since a mark nobody reads is a trap. */
export class MissionMarkMalformed extends Error {
  override readonly name = 'MissionMarkMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${MARKS_HEADING} is not a mark — expected \`- "<text the page writes>": <what it means>\`: ${line}`,
    );
  }
}

/** The marks a mission declares, read from its `## Marks` section, in order; none when the section is absent. */
export const marksOf = declaredSection({
  heading: MARKS_HEADING,
  line: MARK_LINE,
  row: markSchema,
  bound: MARKS_BOUND,
  malformed: MissionMarkMalformed,
});

/** The marks an element carries: every declared token found in its name, or in its words when it has no name. */
export function marksOn(
  element: Pick<ObservedElement, 'name' | 'text'>,
  marks: readonly Mark[],
): Mark[] {
  const written = `${element.name}\n${element.text ?? ''}`;
  return marks.filter((mark) => written.includes(mark.token));
}
