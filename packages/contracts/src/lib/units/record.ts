/**
 * What an advisor answers about units on record, as the goal composer takes
 * it: each unit by its identity, the stance the record takes on it, and a
 * note in the advisor's words. The composer renders a bounded number and
 * counts the rest; the forbidden ones also go into the goal's index for the
 * validator; and the session holds a taskStart to every one of them, listed
 * or not (`refusedOnRecord`), and asks the advisor by identity for one past
 * the advice's own bound.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { unitIdentitySchema } from './identity';
import { UNIT_NOTE_BOUND, UNIT_STANCES } from './vocab';

export const unitOnRecordSchema = z.strictObject({
  identity: unitIdentitySchema,
  stance: z.enum(UNIT_STANCES),
  /** What the record knows of it, as the advisor puts it: "applied 2026-10-03, 2 applications". */
  note: bounded.text(UNIT_NOTE_BOUND),
});
export type UnitOnRecord = z.infer<typeof unitOnRecordSchema>;

/** The units on record a goal is composed with, and how many more the advisor counted past them. */
export interface UnitsOnRecord {
  units: readonly UnitOnRecord[];
  omitted: number;
}

/** What a session composes with when no advisor answered, or none was asked. */
export const NO_UNITS_ON_RECORD: UnitsOnRecord = { units: [], omitted: 0 };

/** The units the validator refuses a taskStart for: those on record as forbidden. */
export const forbiddenOf = (onRecord: UnitsOnRecord): UnitOnRecord[] =>
  onRecord.units.filter((unit) => unit.stance === 'forbid');
