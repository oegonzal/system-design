/**
 * What a mission declares about its units beyond one session: the facts that
 * identify a unit, and the advisors whose record of them the session consults.
 * Two bullet sections in the Marks and Stop conditions grammar family, read
 * through the one declared-section reader.
 *
 *     ## Unit identity
 *
 *     - company: the company as the listing's pane names it.
 *
 *     ## Advisors
 *
 *     - job-application
 *
 * The engine carries a fact's name and compares its values by exact key; what
 * the fact means on the page is the bullet's own prose, read by the planner in
 * the mission itself. An advisor's id is resolved against the configured ones
 * before the session opens; one named and not there refuses the session.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { declaredOnce, declaredSection, WORD } from '../browser-session/mission-sections';
import {
  ADVISOR_ID_MAX_LENGTH,
  ADVISORS_BOUND,
  UNIT_FACET_NAME_MAX_LENGTH,
  UNIT_FACETS_BOUND,
} from './vocab';

export const IDENTITY_HEADING = '## Unit identity';
export const ADVISORS_HEADING = '## Advisors';

/** One bullet: the fact's name, a colon, what it means on the page. */
const IDENTITY_LINE = new RegExp(`^- (?<name>${WORD}): .+$`);
/** One bullet: an advisor's id, nothing else. */
const ADVISOR_LINE = new RegExp(`^- (?<id>${WORD})$`);
/** An advisor's id as one whole word: what a mission names, and what a configured entry may be keyed by. */
export const ADVISOR_ID_PATTERN = new RegExp(`^${WORD}$`);

export class MissionIdentityMalformed extends Error {
  override readonly name = 'MissionIdentityMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${IDENTITY_HEADING} is not a fact — expected \`- <name>: <what it means on the page>\`, the name lower-case words joined by hyphens and declared once: ${line}`,
    );
  }
}

export class MissionAdvisorsMalformed extends Error {
  override readonly name = 'MissionAdvisorsMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${ADVISORS_HEADING} is not an advisor — expected \`- <id>\`, lower-case words joined by hyphens and named once: ${line}`,
    );
  }
}

const facetDeclarationSchema = z.strictObject({
  name: bounded.id(UNIT_FACET_NAME_MAX_LENGTH, { min: 1 }),
});

const advisorDeclarationSchema = z.strictObject({
  id: bounded.id(ADVISOR_ID_MAX_LENGTH, { min: 1 }),
});

const readIdentity = declaredSection({
  heading: IDENTITY_HEADING,
  line: IDENTITY_LINE,
  row: facetDeclarationSchema,
  bound: UNIT_FACETS_BOUND,
  malformed: MissionIdentityMalformed,
  across: declaredOnce((row) => row.name),
});

const readAdvisors = declaredSection({
  heading: ADVISORS_HEADING,
  line: ADVISOR_LINE,
  row: advisorDeclarationSchema,
  bound: ADVISORS_BOUND,
  malformed: MissionAdvisorsMalformed,
  across: declaredOnce((row) => row.id),
});

/** The names of the facts a mission declares as a unit's identity, in order; none when the section is absent. */
export const unitFacetsOf = (mission: string): string[] =>
  readIdentity(mission).map((row) => row.name);

/** The ids of the advisors a mission names, in order; none when the section is absent. */
export const advisorsOf = (mission: string): string[] => readAdvisors(mission).map((row) => row.id);
