import { describe, expect, it } from 'vitest';

import type { TakenOnPage } from '../units/mission-taken';
import { NO_UNITS_ON_RECORD, type UnitOnRecord, type UnitsOnRecord } from '../units/record';
import {
  UNIT_FACET_NAME_MAX_LENGTH,
  UNIT_FACET_VALUE_MAX_LENGTH,
  UNIT_FACETS_BOUND,
  UNIT_NOTE_BOUND,
  UNIT_STANCE_STRENGTH,
  UNIT_STANCES,
  UNIT_STANCES_STRONGEST_FIRST,
  type UnitStance,
} from '../units/vocab';
import { OBJECTION_DETAIL_BOUND } from '../quality-loop/read-back';
import { HISTORY_NOTE_BOUND } from './observation.schema';
import { ON_RECORD_TAKEN } from './step-plan.schema';
import {
  describeForbiddenCut,
  describeOnRecordRefusal,
  describeTakenCut,
  howTaken,
  noteOnRecordRefusal,
  noteOnRecordTaken,
  onRecordLimit,
  refusedOnRecord,
  unitOnRecordFor,
} from './step-record';

const unit = (value: string, stance: UnitOnRecord['stance'], note = ''): UnitOnRecord => ({
  identity: [{ name: 'company', value }],
  stance,
  note,
});
const ACME = unit('Acme', 'avoid', 'applied 2026-10-03');
const GLOBEX = unit('Globex', 'forbid', 'in progress in another session');
const RECORD: UnitsOnRecord = { units: [ACME, GLOBEX], omitted: 0 };
const acme = [{ name: 'company', value: 'Acme' }];
/** The mission declares the exception for a unit to avoid — and, impossibly, for a forbidden one, which the vocabulary never takes. */
const AVOID: readonly UnitStance[] = ['avoid'];
const BOTH: readonly UnitStance[] = ['avoid', 'forbid'];
const NONE: readonly UnitStance[] = [];

describe('a taskStart held to the record', () => {
  it('[BRW-13] refuses a unit on record to avoid unless the mission declares the exception and the plan declares it takes it, refuses a forbidden one whatever either declares, and opens one not on record — every unit matched by the record’s own key, the 41st as much as the first', () => {
    expect(refusedOnRecord({ facets: acme }, RECORD, AVOID)).toBe(ACME);
    expect(refusedOnRecord({ facets: acme, [ON_RECORD_TAKEN]: false }, RECORD, AVOID)).toBe(ACME);
    expect(refusedOnRecord({ facets: acme, [ON_RECORD_TAKEN]: true }, RECORD, AVOID)).toBeNull();
    // A mission declaring no exception grants none: the declaration lifts nothing.
    expect(refusedOnRecord({ facets: acme, [ON_RECORD_TAKEN]: true }, RECORD, NONE)).toBe(ACME);
    expect(
      refusedOnRecord({ facets: [{ name: 'company', value: ' GLOBEX' }] }, RECORD, AVOID),
    ).toBe(GLOBEX);
    expect(
      refusedOnRecord(
        { facets: [{ name: 'company', value: 'Globex' }], [ON_RECORD_TAKEN]: true },
        RECORD,
        BOTH,
      ),
    ).toBe(GLOBEX);
    expect(
      refusedOnRecord({ facets: [{ name: 'company', value: 'Initech' }] }, RECORD, AVOID),
    ).toBeNull();
    // Nothing on record, or a mission declaring no identity, refuses nothing.
    expect(refusedOnRecord({ facets: acme }, NO_UNITS_ON_RECORD, AVOID)).toBeNull();
    expect(refusedOnRecord({ facets: [] }, RECORD, AVOID)).toBeNull();
    // Measured 2026-10-14: the goal lists 40 of the record and counts the rest; the check reads them all.
    const past = Array.from({ length: 60 }, (_, i) => unit(`Company ${i}`, 'avoid'));
    expect(refusedOnRecord({ facets: acme }, { units: [...past, ACME], omitted: 0 }, NONE)).toBe(
      ACME,
    );
  });

  it('[BRW-13] the strongest stance on record for an identity decides, by a strength each stance declares: an advisor forbidding what another merely avoids is not overridden by the declaration', () => {
    const elsewhere = unit('acme', 'forbid', 'in progress elsewhere');
    const both: UnitsOnRecord = { units: [unit('Acme', 'avoid'), elsewhere], omitted: 0 };
    expect(unitOnRecordFor(acme, both)).toBe(elsewhere);
    expect(refusedOnRecord({ facets: acme, [ON_RECORD_TAKEN]: true }, both, AVOID)).toBe(elsewhere);
    expect(new Set(Object.values(UNIT_STANCE_STRENGTH)).size).toBe(UNIT_STANCES.length);
    expect(UNIT_STANCES_STRONGEST_FIRST).toEqual(['forbid', 'avoid']);
    expect(howTaken('avoid', AVOID)).toBe('declared');
    expect(howTaken('avoid', NONE)).toBe('never');
    expect(howTaken('forbid', BOTH)).toBe('never');
  });

  it('[BRW-13] says why in one wording — the rule first, the unit last — so the history’s note and the longest legal objection keep the rule whole, and the validator’s cut shares it', () => {
    expect(describeOnRecordRefusal(ACME, AVOID)).toBe(
      'refused by the session: a unit on record to avoid is started only by a plan declaring onRecordTaken: true, under the exception the mission declares; choose another item, or declare it where the exception holds. The taskStart names company "Acme" (applied 2026-10-03).',
    );
    expect(describeOnRecordRefusal(ACME, NONE)).toBe(
      'refused by the session: a unit on record to avoid is never started; choose another item. The taskStart names company "Acme" (applied 2026-10-03).',
    );
    expect(describeOnRecordRefusal(GLOBEX, BOTH)).toBe(
      'refused by the session: a unit on record as forbidden is never started; choose another item. The taskStart names company "Globex" (in progress in another session).',
    );
    // A unit the record keeps no note on is named without one.
    expect(describeOnRecordRefusal(unit('Initech', 'avoid'), AVOID)).toMatch(
      /The taskStart names company "Initech"\.$/,
    );
    expect(noteOnRecordRefusal(ACME)).toBe(
      'refused by the session: on record to avoid (applied 2026-10-03)',
    );
    expect(noteOnRecordRefusal(unit('Initech', 'forbid'))).toBe(
      'refused by the session: on record as forbidden',
    );
    expect(noteOnRecordTaken(ACME)).toBe(
      'takes a unit on record to avoid (applied 2026-10-03), as declared',
    );
    expect(noteOnRecordTaken(null)).toBe('declares onRecordTaken for a unit not on record');
    expect(describeForbiddenCut(GLOBEX)).toBe(
      'taskStart names company "Globex" (in progress in another session), a unit on record as forbidden: such a unit is never started; choose another item',
    );
    // The longest identity and note a record may hold: the objection's bound clips the unit's tail, never the rule; the history's note always fits.
    const longest: UnitOnRecord = {
      identity: Array.from({ length: UNIT_FACETS_BOUND.ceiling }, (_, i) => ({
        name: `${'f'.repeat(UNIT_FACET_NAME_MAX_LENGTH - 1)}${i}`,
        value: 'v'.repeat(UNIT_FACET_VALUE_MAX_LENGTH),
      })),
      stance: 'avoid',
      note: 'n'.repeat(UNIT_NOTE_BOUND.ceiling),
    };
    const worst = describeOnRecordRefusal(longest, AVOID);
    expect(worst.length).toBeGreaterThan(OBJECTION_DETAIL_BOUND.target);
    expect(worst.indexOf('The taskStart names')).toBeLessThan(OBJECTION_DETAIL_BOUND.target);
    expect(noteOnRecordRefusal(longest).length).toBeLessThanOrEqual(HISTORY_NOTE_BOUND.target);
  });

  it('[BRW-13] the Limits line says the rule once for each stance the record holds, and how this page bears on the mission’s exception', () => {
    const open: TakenOnPage[] = [{ stance: 'avoid', control: 'Next page', shown: false }];
    const withheld: TakenOnPage[] = [{ stance: 'avoid', control: 'Next page', shown: true }];
    const avoided: UnitsOnRecord = { units: [ACME], omitted: 0 };
    expect(onRecordLimit(RECORD, open)).toBe(
      '- A taskStart naming a unit on record, listed above or not, is refused by the session and the plan stops there: a unit on record as forbidden is never started; a unit on record to avoid is started only by a plan declaring onRecordTaken: true, under the exception the mission declares — withheld while the page lists "Next page"; this page lists none.',
    );
    expect(onRecordLimit(avoided, withheld)).toBe(
      '- A taskStart naming a unit on record, listed above or not, is refused by the session and the plan stops there: a unit on record to avoid is started only by a plan declaring onRecordTaken: true, under the exception the mission declares — withheld while the page lists "Next page"; this page lists "Next page".',
    );
    // No exception declared: a unit to avoid is never started, and a stance the record does not hold is not mentioned.
    expect(onRecordLimit(avoided, [])).toBe(
      '- A taskStart naming a unit on record, listed above or not, is refused by the session and the plan stops there: a unit on record to avoid is never started.',
    );
    // An exception tied to no control is open on every page, and says nothing of the page.
    expect(onRecordLimit(avoided, [{ stance: 'avoid', control: null, shown: false }])).toMatch(
      /under the exception the mission declares\.$/,
    );
  });

  it('[QL-66] the cut of a declaration: where the mission declares no exception, where every declared stance is withheld by a control this page lists, and nowhere else', () => {
    expect(describeTakenCut([])).toBe(
      'taskStart declares onRecordTaken: the mission declares no exception for a unit on record, so none may be taken — choose another item',
    );
    expect(describeTakenCut([{ stance: 'avoid', control: 'Next page', shown: true }])).toBe(
      'taskStart declares onRecordTaken on a page that lists "Next page": the mission withholds its exception while the page does — choose another item',
    );
    expect(describeTakenCut([{ stance: 'avoid', control: 'Next page', shown: false }])).toBeNull();
    expect(describeTakenCut([{ stance: 'avoid', control: null, shown: false }])).toBeNull();
    // One stance tied to two controls is withheld while either is listed, and the cut names the one that is.
    expect(
      describeTakenCut([
        { stance: 'avoid', control: 'Next page', shown: true },
        { stance: 'avoid', control: 'More results', shown: false },
      ]),
    ).toContain('on a page that lists "Next page":');
  });
});
