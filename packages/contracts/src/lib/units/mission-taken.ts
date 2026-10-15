/**
 * What a mission declares about taking a unit on record: the stance under
 * which such a unit may still be started, and the control whose presence on
 * the page withholds that. One bullet section in the Marks and Stop
 * conditions grammar family, read through the one declared-section reader:
 *
 *     ## Taking a unit on record
 *
 *     - avoid unless "Next": only when no next page is listed may one be taken.
 *
 * A plan takes such a unit by declaring `onRecordTaken: true` on its
 * taskStart. The engine reads the stance and the control's name and nothing
 * else: what the exception means is the bullet's own prose, read by the
 * planner in the mission itself. The composer writes into the step index
 * whether this page lists the control — an element of exactly that name a
 * plan could act on — and the limits validator cuts the declaration where the
 * mission declares no exception or where every stance it declares is withheld;
 * the session lifts its refusal of a unit on record only for a stance the
 * mission declares here. A mission without the section grants none: a unit on
 * record to avoid is then never started, as a forbidden one never is.
 *
 * Measured 2026-10-14 over 263 recorded results pages: 249 listed an enabled
 * control named "Next" and none a disabled one; 17 element names contained the
 * word without being it, so a control is matched by its whole name, never as
 * a substring of the page's words.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { declaredSection } from '../browser-session/mission-sections';
import type { ObservedElement } from '../browser-session/observation.schema';
import { UNIT_STANCE_TAKEN, UNIT_STANCES, type UnitStance } from './vocab';

export const TAKEN_HEADING = '## Taking a unit on record';
/** The most bullets the section holds: one per stance, or one per control a stance is tied to — a page has few. */
export const TAKEN_BOUND = bound(4, 'list');
export const TAKEN_CONTROL_MAX_LENGTH = 60;

/** The stances a mission may declare an exception for: those the engine's vocabulary says are taken by declaration. */
const TAKEABLE = UNIT_STANCES.filter((stance) => UNIT_STANCE_TAKEN[stance] === 'declared');

const takenDeclarationSchema = z.strictObject({
  stance: z.enum(UNIT_STANCES).refine((stance) => UNIT_STANCE_TAKEN[stance] === 'declared'),
  /** The exact name of a control the page lists while the exception is withheld; null when the mission ties it to none. */
  control: bounded.id(TAKEN_CONTROL_MAX_LENGTH, { min: 1 }).nullable(),
});
type TakenDeclaration = z.infer<typeof takenDeclarationSchema>;

/** One bullet: the stance, an optional `unless` with the control's quoted name, a colon, the meaning. */
const TAKEN_LINE = /^- (?<stance>[a-z][a-z0-9-]*)(?: unless "(?<control>[^"]+)")?: .+$/;

/** A bullet the grammar does not read; the mission is refused before any page is, since an exception nobody reads is a trap. */
export class MissionTakenMalformed extends Error {
  override readonly name = 'MissionTakenMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${TAKEN_HEADING} is not an exception — expected \`- <stance>: <meaning>\` or \`- <stance> unless "<control the page lists>": <meaning>\`, the stance one of ${TAKEABLE.join(', ')}, each control once, and a stance declared without a control declared no other way: ${line}`,
    );
  }
}

/** A stance declared both with and without a control contradicts itself, and one control declared twice says nothing new: the second bullet is the offending one. */
const oneWayPerStance = (
  rows: readonly TakenDeclaration[],
  lines: readonly string[],
): string | null => {
  const seen = new Map<UnitStance, Set<string | null>>();
  for (const [index, row] of rows.entries()) {
    const controls = seen.get(row.stance) ?? new Set<string | null>();
    if (
      controls.has(row.control) ||
      controls.has(null) ||
      (row.control === null && controls.size > 0)
    ) {
      return lines[index] ?? null;
    }
    controls.add(row.control);
    seen.set(row.stance, controls);
  }
  return null;
};

/** The exceptions a mission declares, in order; none when the section is absent. */
export const takenOf = declaredSection({
  heading: TAKEN_HEADING,
  line: TAKEN_LINE,
  row: takenDeclarationSchema,
  bound: TAKEN_BOUND,
  malformed: MissionTakenMalformed,
  across: oneWayPerStance,
});

/** The stances the mission declares an exception for, each once: what the session lifts a refusal for when the plan declares it. */
export const takenStancesOf = (mission: string): UnitStance[] => [
  ...new Set(takenOf(mission).map((row) => row.stance)),
];

/** One declared exception as this page bears on it: the step index's entry. */
export interface TakenOnPage {
  stance: UnitStance;
  control: string | null;
  /** Whether this page lists the control: the exception is withheld while it does. */
  shown: boolean;
}

/** Whether the page lists a control of exactly this name that a plan could act on: a disabled one, or one a person could not reach, offers no next step. */
const listsControl = (control: string, elements: readonly ObservedElement[]): boolean =>
  elements.some((element) => element.name === control && element.visible && !element.disabled);

/** The declared exceptions, each with whether this page lists its control; one tied to no control is never withheld. */
export const takenOnPage = (
  declared: readonly TakenDeclaration[],
  observation: { elements: readonly ObservedElement[] },
): TakenOnPage[] =>
  declared.map((row) => ({
    stance: row.stance,
    control: row.control,
    shown: row.control !== null && listsControl(row.control, observation.elements),
  }));

/** The stances an exception is open for on this page: declared, and withheld by no control the page lists. */
export const takenOpenOn = (taken: readonly TakenOnPage[]): UnitStance[] => [
  ...new Set(
    taken
      .filter((row) => !taken.some((other) => other.stance === row.stance && other.shown))
      .map((row) => row.stance),
  ),
];
