/**
 * A taskStart held to the record the step was composed with — every unit the
 * advisors answered, never only the ones the goal had room to list. Measured
 * 2026-10-14 on a live session: 43 units on record, every one to avoid, and a
 * step goal of 63,954 bytes with the snapshot already at the words-cut rung,
 * so the rendering listed forty of them and counted three;
 * the planner wrote of one of the three that it was not on the list, opened
 * it, and began applying again where an application had gone four days
 * before. The rule is declared per stance (`UNIT_STANCE_TAKEN`) and granted
 * per mission (`## Taking a unit on record`), and it is phrased from here
 * alone — by the session that refuses, by the validator that cuts, by the
 * goal's Limits and by the refusal the next plan answers; the engine compares
 * declared facts by key and never reads what the mission's exception means.
 */
import { quoted } from '../text';
import { describeIdentity, matchesRecord, type UnitFacet } from '../units/identity';
import { takenOpenOn, type TakenOnPage } from '../units/mission-taken';
import type { UnitOnRecord, UnitsOnRecord } from '../units/record';
import {
  UNIT_STANCE_ON_RECORD,
  UNIT_STANCE_TAKEN,
  UNIT_STANCES_STRONGEST_FIRST,
  type UnitStance,
  type UnitStanceTaken,
} from '../units/vocab';
import { ON_RECORD_TAKEN } from './step-plan.schema';

/** What a taskStart declares that the record is read against: its identity, and whether it takes a unit on record. */
interface TaskStartClaim {
  facets: readonly UnitFacet[];
  [ON_RECORD_TAKEN]?: boolean;
}

/** How a unit of this stance may be started under this mission: by declaration where the mission declares the exception for it, else never. */
export const howTaken = (stance: UnitStance, declared: readonly UnitStance[]): UnitStanceTaken =>
  declared.includes(stance) ? UNIT_STANCE_TAKEN[stance] : 'never';

/** How a unit of each way of being taken is started, and what a refused plan does instead, in the words every refusal shares. */
const TAKEN_RULES = {
  never: { rule: 'is never started', instead: 'choose another item' },
  declared: {
    rule: `is started only by a plan declaring ${ON_RECORD_TAKEN}: true, under the exception the mission declares`,
    instead: 'choose another item, or declare it where the exception holds',
  },
} as const satisfies Record<UnitStanceTaken, { rule: string; instead: string }>;

/** The unit on record a claim names, by the one key the record uses, strongest stance first; null when it names none. */
export function unitOnRecordFor(
  facets: readonly UnitFacet[],
  onRecord: UnitsOnRecord,
): UnitOnRecord | null {
  for (const stance of UNIT_STANCES_STRONGEST_FIRST) {
    const hit = onRecord.units.find(
      (unit) => unit.stance === stance && matchesRecord(facets, unit.identity),
    );
    if (hit !== undefined) return hit;
  }
  return null;
}

/**
 * The unit on record that refuses this taskStart, or null when it may open: a
 * match is refused unless its stance is taken by declaration under this
 * mission (`declared`: the stances its exception names) and the plan declares
 * it. A claim with no facets matches nothing, so a mission declaring no
 * identity is never refused.
 */
export function refusedOnRecord(
  claim: TaskStartClaim,
  onRecord: UnitsOnRecord,
  declared: readonly UnitStance[],
): UnitOnRecord | null {
  const hit = unitOnRecordFor(claim.facets, onRecord);
  if (hit === null) return null;
  const taken = howTaken(hit.stance, declared) === 'declared' && claim[ON_RECORD_TAKEN] === true;
  return taken ? null : hit;
}

/** `company "Acme" (applied 2026-10-03)`: a unit as every refusal names it, with the record's note. */
const unitWithNote = (unit: UnitOnRecord): string =>
  `${describeIdentity(unit.identity)}${unit.note === '' ? '' : ` (${unit.note})`}`;

/** `a unit on record to avoid is started only by …`: one stance's rule, as the Limits, a refusal and a cut all say it. */
const stanceRule = (stance: UnitStance, taken: UnitStanceTaken): string =>
  `a unit on record ${UNIT_STANCE_ON_RECORD[stance]} ${TAKEN_RULES[taken].rule}`;

/**
 * Why the session refused a taskStart, as the next plan is told to answer it:
 * the rule and what to do instead first, the unit last, so a detail clipped at
 * the objection's bound loses the record's note and never the rule.
 */
export const describeOnRecordRefusal = (
  unit: UnitOnRecord,
  declared: readonly UnitStance[],
): string => {
  const taken = howTaken(unit.stance, declared);
  return `refused by the session: ${stanceRule(unit.stance, taken)}; ${TAKEN_RULES[taken].instead}. The taskStart names ${unitWithNote(unit)}.`;
};

/** The history's note on the refused taskStart: the fact alone, the objection carrying the reason once. */
export const noteOnRecordRefusal = (unit: UnitOnRecord): string =>
  `refused by the session: on record ${UNIT_STANCE_ON_RECORD[unit.stance]}${unit.note === '' ? '' : ` (${unit.note})`}`;

/** The history's note on a taskStart that declared it takes a unit on record and opened: what it took, or that nothing on record matched it. */
export const noteOnRecordTaken = (unit: UnitOnRecord | null): string =>
  unit === null
    ? `declares ${ON_RECORD_TAKEN} for a unit not on record`
    : `takes a unit on record ${UNIT_STANCE_ON_RECORD[unit.stance]}${unit.note === '' ? '' : ` (${unit.note})`}, as declared`;

/** Why the validator cut a taskStart at a unit the index lists as forbidden: the unit, then the one rule such a unit has. */
export const describeForbiddenCut = (unit: Pick<UnitOnRecord, 'identity' | 'note'>): string =>
  `taskStart names ${unitWithNote({ ...unit, stance: 'forbid' })}, a unit on record ${UNIT_STANCE_ON_RECORD.forbid}: such a unit ${TAKEN_RULES.never.rule}; ${TAKEN_RULES.never.instead}`;

/**
 * Why the validator cut a taskStart declaring it takes a unit on record, or
 * null when the declaration stands on this page: the mission declares no
 * exception, or every stance it declares is withheld by a control this page
 * lists. Which unit the plan takes is the session's to check.
 */
export function describeTakenCut(taken: readonly TakenOnPage[]): string | null {
  if (taken.length === 0) {
    return `taskStart declares ${ON_RECORD_TAKEN}: the mission declares no exception for a unit on record, so none may be taken — ${TAKEN_RULES.never.instead}`;
  }
  if (takenOpenOn(taken).length > 0) return null;
  const listed = [
    ...new Set(taken.filter((row) => row.shown).map((row) => quoted(row.control ?? ''))),
  ];
  return `taskStart declares ${ON_RECORD_TAKEN} on a page that lists ${listed.join(' and ')}: the mission withholds its exception while the page does — ${TAKEN_RULES.never.instead}`;
}

/** `withheld while the page lists "Next"; this page lists "Next"`: how the page bears on one declared stance's exception. */
const pageClause = (stance: UnitStance, taken: readonly TakenOnPage[]): string => {
  const controls = taken.filter((row) => row.stance === stance && row.control !== null);
  if (controls.length === 0) return '';
  const listed = controls.filter((row) => row.shown).map((row) => quoted(row.control ?? ''));
  return ` — withheld while the page lists ${controls
    .map((row) => quoted(row.control ?? ''))
    .join(' or ')}; this page lists ${listed.length === 0 ? 'none' : listed.join(' and ')}`;
};

/**
 * The Limits line for a goal composed with units on record: a taskStart naming
 * any of them is refused, listed or not, under the rule of each stance the
 * record holds — and, for a stance the mission declares an exception for,
 * whether this page withholds it. Said once here; the Units of work heading
 * names the stance and the count says what was not listed.
 */
export const onRecordLimit = (onRecord: UnitsOnRecord, taken: readonly TakenOnPage[]): string => {
  const declared = taken.map((row) => row.stance);
  const rules = UNIT_STANCES_STRONGEST_FIRST.filter((stance) =>
    onRecord.units.some((unit) => unit.stance === stance),
  ).map(
    (stance) => `${stanceRule(stance, howTaken(stance, declared))}${pageClause(stance, taken)}`,
  );
  return `- A taskStart naming a unit on record, listed above or not, is refused by the session and the plan stops there: ${rules.join('; ')}.`;
};
