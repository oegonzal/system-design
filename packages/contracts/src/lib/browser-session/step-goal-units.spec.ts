import { describe, expect, it } from 'vitest';

import { textBytes } from '../quality-loop/goal-index';
import { UNITS_ON_RECORD_BYTES_BOUND } from '../units/vocab';
import type { UnitOnRecord } from '../units/record';
import {
  emptyLedger,
  listingObservation,
  MISSION_WITH_IDENTITY,
  MISSION_WITH_TAKEN,
  openTaskLedger,
  stepGoalInput,
} from './fixtures';
import { REFUSED_UNITS_BOUND, type TaskLedgerSummary } from './observation.schema';
import { composeStepGoal } from './step-goal';
import { readStepIndex } from './step-index';

const onRecord = (name: string, stance: UnitOnRecord['stance'], note = ''): UnitOnRecord => ({
  identity: [{ name: 'company', value: name }],
  stance,
  note,
});

describe('the Units of work section with a record beyond this session', () => {
  it('[BRW-13] writes the declared facet names into the index and says in the Limits what a taskStart carries; a mission declaring none writes and says nothing', () => {
    const declared = composeStepGoal(stepGoalInput({ mission: MISSION_WITH_IDENTITY }));
    expect(readStepIndex(declared)?.unitFacets).toEqual(['company']);
    expect(declared).toContain(
      "- A taskStart carries each fact the mission's Unit identity declares — company — once, with its value exactly as this page names it, and no other fact.",
    );
    const plain = composeStepGoal(stepGoalInput());
    expect(readStepIndex(plain)?.unitFacets).toEqual([]);
    expect(plain).not.toContain('Unit identity declares');
  });

  it('[BRW-13] renders the units on record under Units of work, strongest stance first with the engine’s word on each, each by its identity’s values with the facts named once and no note; only the forbidden ones reach the index, and the Limits state the session’s check of the whole record once, with the mission’s exception as this page bears on it', () => {
    const record = {
      units: [
        onRecord('Acme', 'avoid', 'applied 2026-10-03, 2 applications'),
        onRecord('Globex', 'forbid', 'in progress in another session'),
      ],
      omitted: 0,
    };
    const goal = composeStepGoal(
      stepGoalInput({ mission: MISSION_WITH_IDENTITY, onRecord: record }),
    );
    expect(goal).toContain(
      '- On record from earlier sessions as forbidden (never started):\n  - by company: "Globex"\n- On record from earlier sessions to avoid (prefer another item):\n  - by company: "Acme"',
    );
    expect(goal).not.toContain('applied 2026-10-03');
    // The mission declares no exception: a unit to avoid is never started, and the rule is said once.
    expect(goal).toContain(
      '- A taskStart naming a unit on record, listed above or not, is refused by the session and the plan stops there: a unit on record as forbidden is never started; a unit on record to avoid is never started.',
    );
    expect(goal.split('a unit on record as forbidden is never started')).toHaveLength(2);
    const index = readStepIndex(goal);
    expect(index?.unitsForbidden).toEqual([
      { identity: [{ name: 'company', value: 'Globex' }], note: 'in progress in another session' },
    ]);
    expect(index?.onRecordTaken).toEqual([]);
    expect(JSON.stringify(index)).not.toContain('Acme');
    // The mission declares the exception, and this page lists the control it is tied to: withheld here, said in the Limits and written into the index.
    const taken = composeStepGoal(stepGoalInput({ mission: MISSION_WITH_TAKEN, onRecord: record }));
    expect(taken).toContain(
      'a unit on record to avoid is started only by a plan declaring onRecordTaken: true, under the exception the mission declares — withheld while the page lists "Next page"; this page lists "Next page".',
    );
    expect(readStepIndex(taken)?.onRecordTaken).toEqual([
      { stance: 'avoid', control: 'Next page', shown: true },
    ]);
    // A goal composed with nothing on record states no such rule, whatever the mission declares.
    expect(composeStepGoal(stepGoalInput({ mission: MISSION_WITH_TAKEN }))).not.toContain(
      'is refused by the session',
    );
  });

  it('[BRW-13] names every unit on record within the bytes the record may take, groups units by the facts they are known by, counts the rest, and counts apart what the advisor itself left out; a record with nothing in it renders nothing', () => {
    // Measured 2026-11-06: 185 companies on record, 40 lines rendered with notes, and the planner opened companies
    // past the forty, a refused step each; named by value alone, all 185 take 2,952 bytes against 2,520 for the forty.
    const units = Array.from({ length: 900 }, (_, i) =>
      onRecord(`Company ${i}`, 'avoid', 'applied'),
    );
    const goal = composeStepGoal(
      stepGoalInput({ mission: MISSION_WITH_IDENTITY, onRecord: { units, omitted: 7 } }),
    );
    const listed = /^ {2}- by company: (.*)$/m.exec(goal)?.[1] ?? '';
    const names = listed.split(', ');
    // In the advisor's order, as many as the bytes allow, and the rest counted.
    expect(names.slice(0, 3)).toEqual(['"Company 0"', '"Company 1"', '"Company 2"']);
    expect(textBytes(listed)).toBeLessThanOrEqual(UNITS_ON_RECORD_BYTES_BOUND.target);
    expect(names.length).toBeGreaterThan(200);
    expect(goal).toContain(
      `  (${900 - names.length} more on record not listed)\n  (7 more on record the advisor counted and did not name — asked by identity at each taskStart)`,
    );
    expect(goal).toContain('listed above or not, is refused by the session');
    // Units known by other facts are a group of their own, each fact named once.
    const mixed = composeStepGoal(
      stepGoalInput({
        mission: MISSION_WITH_IDENTITY,
        onRecord: {
          units: [
            onRecord('Acme', 'avoid'),
            {
              identity: [
                { name: 'company', value: 'Initech' },
                { name: 'title', value: 'Staff Engineer' },
              ],
              stance: 'avoid',
              note: '',
            },
            onRecord('Globex', 'avoid'),
          ],
          omitted: 0,
        },
      }),
    );
    expect(mixed).toContain(
      '  - by company: "Acme", "Globex"\n  - by company · title: "Initech" · "Staff Engineer"',
    );
    // Only what the advisor left out: nothing cut from the listing.
    const counted = composeStepGoal(
      stepGoalInput({
        mission: MISSION_WITH_IDENTITY,
        onRecord: { units: units.slice(0, 2), omitted: 7 },
      }),
    );
    expect(counted).not.toContain('more on record not listed');
    expect(counted).toContain(
      '  (7 more on record the advisor counted and did not name — asked by identity at each taskStart)',
    );
    const empty = composeStepGoal(stepGoalInput({ mission: MISSION_WITH_IDENTITY }));
    expect(empty).not.toContain('On record from earlier sessions');
    expect(empty).not.toContain('more on record');
  });

  it('[BRW-13] renders a closed or open unit’s identity beside its label, so the planner can keep off an item sharing one', () => {
    const goal = composeStepGoal(
      stepGoalInput({
        mission: MISSION_WITH_IDENTITY,
        observation: listingObservation(),
        ledger: {
          ...openTaskLedger(),
          openTask: {
            label: 'Senior Engineer at Acme',
            url: 'https://jobs.example.test/apply/42',
            facets: [{ name: 'company', value: 'Acme' }],
          },
          closed: [
            {
              label: 'Staff Engineer at Globex',
              outcome: 'done',
              facets: [{ name: 'company', value: 'Globex' }],
            },
          ],
        },
      }),
    );
    expect(goal).toContain(
      '- Open unit of work: "Senior Engineer at Acme" · company "Acme" at https://jobs.example.test/apply/42',
    );
    expect(goal).toContain('  - "Staff Engineer at Globex" · company "Globex" — done');
  });
});

/** The step goal of a listing page under a ledger, as the Units of work section renders it. */
const goalUnder = (ledger: TaskLedgerSummary): string =>
  composeStepGoal(
    stepGoalInput({
      observation: listingObservation(),
      history: [],
      ledger,
      objections: [],
      progress: { criteria: [], settled: [], done: [] },
    }),
  );

describe('the Units of work section with this session alone', () => {
  it('[QL-39] tells the planner no unit is open, that an item passed over needs none, and that nothing has closed yet', () => {
    const goal = goalUnder(emptyLedger());
    expect(goal).toContain(
      '- No unit of work is open: taskStart opens one when the procedure takes an item up; an item the mission says to pass over gets no taskStart.',
    );
    expect(goal).toContain('- Closed this session: none yet.');
    expect(goal).toContain('- Closed so far: done 0 · already-done 0 · skipped 0 · failed 0.');
    expect(goal).not.toContain('may still be started');
    // No target was set, so none is told.
    expect(goal).not.toContain('- Target:');
  });

  it('[QL-39] tells the planner how far the session is toward its target, counted on done units alone, and that reaching it ends the session', () => {
    const ledger = { ...openTaskLedger(), targetDone: 3 };
    expect(goalUnder(ledger)).toContain(
      '- Target: 1 of 3 closed done — the session ends complete when it is reached.',
    );
  });

  it('[BRW-13] names every unit the session refused on record, newest first with the record’s note, counting the older ones, so no later goal reads as if it had not met them', () => {
    const refused = (value: string, note: string) => ({
      facets: [{ name: 'company', value }],
      note,
    });
    const goal = goalUnder({
      ...openTaskLedger(),
      refused: [refused('Globex', 'applied 2026-11-01'), refused('Acme', '')],
      refusedOmitted: REFUSED_UNITS_BOUND.target,
    });
    expect(goal).toContain(
      [
        '- Refused this session, on record — never taken up again:',
        '  - company "Globex" — applied 2026-11-01',
        '  - company "Acme"',
        `  (${REFUSED_UNITS_BOUND.target} older not listed)`,
      ].join('\n'),
    );
    expect(goalUnder(openTaskLedger())).not.toContain('Refused this session');
  });
});
