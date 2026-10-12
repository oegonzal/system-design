/**
 * Units of work beyond one session: the engine's vocabulary for what a domain
 * service — an advisor — knows about them. A mission declares which facts
 * identify a unit; a plan carries them as facets; an advisor answers which
 * identities are on record and with what stance; the engine compares declared
 * facts by exact key and never learns what any of them means.
 */
import { bound } from '../bounds';

/** What an advisor says of a unit on record: prefer another, or never start it. */
export const UNIT_STANCES = ['avoid', 'forbid'] as const;
export type UnitStance = (typeof UNIT_STANCES)[number];

/**
 * The engine's meaning of each stance, as the goal states it. What to do with
 * an avoided unit is the mission's prose to say; a forbidden one the limits
 * validator refuses.
 */
export const UNIT_STANCE_MEANINGS = {
  avoid: 'prefer another item; the mission says when one of these may still be taken',
  forbid: 'never started — a taskStart naming one is cut',
} as const satisfies Record<UnitStance, string>;

/** The most facts a mission declares as a unit's identity. */
export const UNIT_FACETS_BOUND = bound(4, 'list');
export const UNIT_FACET_NAME_MAX_LENGTH = 40;
/**
 * A facet's value is an exact id, never lenient text: an overlong value
 * refuses the plan it is on, so a bad value is never stored and never voids a
 * later goal that carries it. Sized above the longest recorded company name.
 */
export const UNIT_FACET_VALUE_MAX_LENGTH = 120;
/** How many units on record the goal renders; the rest are counted. The goal budget has no slack to spend here. */
export const UNITS_ON_RECORD_BOUND = bound(40, 'list');
/** An advisor's note on a unit: what the record knows, in a few words. */
export const UNIT_NOTE_BOUND = bound(80);
/** The most advisors a mission names. */
export const ADVISORS_BOUND = bound(4, 'list');
export const ADVISOR_ID_MAX_LENGTH = 40;
/**
 * The most units an advisor answers with; the rest it counts as omitted. Both
 * sides read it here, so a request carries no limit of its own: the goal
 * renders `UNITS_ON_RECORD_BOUND` of them and counts the rest again.
 */
export const ADVICE_UNITS_BOUND = bound(200, 'list');
