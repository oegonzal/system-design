/**
 * What a mission declares about where a page states what a unit of work is:
 * one landmark, named from the closed vocabulary (`LANDMARK_ROLES`), whose
 * words the session captures as the unit opens and carries to the answerer
 * beside the unit. One bullet section in the Marks and Stop conditions grammar
 * family, read through the one declared-section reader.
 *
 *     ## Unit context
 *
 *     - landmark: main
 *
 * The engine reads the landmark's role and nothing else: what the landmark
 * holds on a page is the site's layout, a mission that declares none carries
 * no statement, and a role the vocabulary does not name refuses the session
 * before it has a row.
 */
import { z } from 'zod';

import { exact } from '../bounds';
import { declaredSection } from '../browser-session/mission-sections';
import { LANDMARK_ROLES, type LandmarkRole } from '../browser-session/vocab';

export const CONTEXT_HEADING = '## Unit context';

/** One bullet: the word `landmark`, a colon, a role as the vocabulary spells it. */
const CONTEXT_LINE = /^- landmark: (?<landmark>[a-z]+)$/;

export class MissionContextMalformed extends Error {
  override readonly name = 'MissionContextMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${CONTEXT_HEADING} is not a landmark — expected \`- landmark: <role>\`, the role one of ${LANDMARK_ROLES.join(', ')} and declared once: ${line}`,
    );
  }
}

const contextDeclarationSchema = z.strictObject({ landmark: z.enum(LANDMARK_ROLES) });

const readContext = declaredSection({
  heading: CONTEXT_HEADING,
  line: CONTEXT_LINE,
  row: contextDeclarationSchema,
  bound: exact(1),
  malformed: MissionContextMalformed,
  // One landmark is the unit's statement; a second line is the one refused.
  across: (_rows, lines) => lines[1] ?? null,
});

/** The landmark a mission declares as a unit's own statement of itself, or null when the section is absent. */
export const unitContextLandmarkOf = (mission: string): LandmarkRole | null =>
  readContext(mission)[0]?.landmark ?? null;
