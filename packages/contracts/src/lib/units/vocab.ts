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
 * How strongly each stance holds, declared rather than read off an array: a
 * new stance states its place. The strongest is rendered and matched first,
 * so what refuses a unit outright wins over what merely prefers another when
 * two advisors answer one identity.
 */
export const UNIT_STANCE_STRENGTH = {
  avoid: 1,
  forbid: 2,
} as const satisfies Record<UnitStance, number>;

export const UNIT_STANCES_STRONGEST_FIRST: readonly UnitStance[] = [...UNIT_STANCES].sort(
  (a, b) => UNIT_STANCE_STRENGTH[b] - UNIT_STANCE_STRENGTH[a],
);

/** How a unit of each stance is said to be on record — `on record to avoid`, `on record as forbidden` — in the goal, the Limits and a refusal alike. */
export const UNIT_STANCE_ON_RECORD = {
  avoid: 'to avoid',
  forbid: 'as forbidden',
} as const satisfies Record<UnitStance, string>;

/**
 * The engine's meaning of each stance, as the Units of work heading states it
 * in a few words; the rule a taskStart is held to is the Limits' to say, once
 * (`onRecordLimit`), so the heading does not repeat it.
 */
export const UNIT_STANCE_MEANINGS = {
  avoid: 'prefer another item',
  forbid: 'never started',
} as const satisfies Record<UnitStance, string>;

/**
 * How a plan may still start a unit of each stance. `declared`: by declaring
 * on its taskStart that it takes a unit on record, where the mission declares
 * the exception under its `## Taking a unit on record` section — a mission
 * that declares none grants none, and such a unit is then never started.
 * `never`: not at all, whatever a mission or a plan declares. Enforced by the
 * session at taskStart against the whole record the step was composed with
 * (`refusedOnRecord`), and by the limits validator for a declaration the
 * mission never granted or this page withholds.
 */
export const UNIT_STANCE_TAKEN = {
  avoid: 'declared',
  forbid: 'never',
} as const satisfies Record<UnitStance, 'declared' | 'never'>;
export type UnitStanceTaken = (typeof UNIT_STANCE_TAKEN)[UnitStance];

/** The most facts a mission declares as a unit's identity. */
export const UNIT_FACETS_BOUND = bound(4, 'list');
export const UNIT_FACET_NAME_MAX_LENGTH = 40;
/**
 * A facet's value is an exact id, never lenient text: an overlong value
 * refuses the plan it is on, so a bad value is never stored and never voids a
 * later goal that carries it. Sized above the longest recorded company name.
 */
export const UNIT_FACET_VALUE_MAX_LENGTH = 120;
/**
 * How many bytes the goal spends naming the units on record: each by its
 * identity's values alone, the facts named once per group, until this many
 * bytes; the rest are counted, and the session holds a taskStart to every
 * unit on record whether the goal listed it or not (`refusedOnRecord`). A
 * rendering bound, never the enforcement's, sized to what forty lines with
 * notes took: measured 2026-10-14, a goal composed with 43 units stood at
 * 63,954 of 64,000 bytes with the snapshot already at the words-cut rung, so
 * every byte spent on a unit is a byte taken from the page; and measured
 * 2026-11-06, 185 companies on record listed whole by name took 2,952 bytes
 * against 2,520 for the forty lines, while the planner opened companies past
 * the forty and the session refused each, a step lost every time. Resized
 * 2026-11-09: 262 companies on record in the window took 3,174 bytes of names
 * against the 3,200 then allowed, and the planner opened one past the listing
 * in three sessions running, a step lost each; names run about twelve bytes,
 * so this names some 650 — the record for a while yet — of a 64,000-byte goal
 * whose composer trims the page by declared rungs before it refuses.
 */
export const UNITS_ON_RECORD_BYTES_BOUND = bound(10_000);
/** An advisor's note on a unit: what the record knows, in a few words. */
export const UNIT_NOTE_BOUND = bound(80);
/** The most advisors a mission names. */
export const ADVISORS_BOUND = bound(4, 'list');
export const ADVISOR_ID_MAX_LENGTH = 40;
/**
 * The most units an advisor answers with; the rest it counts as omitted. Both
 * sides read it here, so a request carries no limit of its own: the goal
 * names them within `UNITS_ON_RECORD_BYTES_BOUND` and counts the rest, and the
 * session holds a taskStart to every one of them, asking the advisor by
 * identity for one it counted past this bound and did not name. Sized with the
 * bytes bound, so the goal can name the whole record: measured 2026-11-09, 262
 * companies on record were answered as 200 and 62 counted.
 */
export const ADVICE_UNITS_BOUND = bound(600, 'list');
