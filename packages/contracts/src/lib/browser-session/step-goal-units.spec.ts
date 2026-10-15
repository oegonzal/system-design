import { describe, expect, it } from 'vitest';

import { UNITS_ON_RECORD_BOUND } from '../units/vocab';
import type { UnitOnRecord } from '../units/record';
import {
  listingObservation,
  MISSION_WITH_IDENTITY,
  MISSION_WITH_TAKEN,
  openTaskLedger,
  stepGoalInput,
} from './fixtures';
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

  it('[BRW-13] renders the units on record under Units of work, strongest stance first with the engine’s word on each, each by its identity and the advisor’s note; only the forbidden ones reach the index, and the Limits state the session’s check of the whole record once, with the mission’s exception as this page bears on it', () => {
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
      '- On record from earlier sessions as forbidden (never started):\n  - company "Globex" — in progress in another session\n- On record from earlier sessions to avoid (prefer another item):\n  - company "Acme" — applied 2026-10-03, 2 applications',
    );
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

  it('[BRW-13] renders the bound, counts the rest, and counts apart what the advisor itself left out; a record with nothing in it renders nothing', () => {
    // Measured 2026-10-14: 43 on record, 40 rendered, and the planner opened
    // one of the three cut as "not on the list". The Limits now say once that
    // a taskStart is refused at any unit on record, listed or not; the count
    // only counts, and what the advisor counted past its own bound is nobody's
    // to refuse, so it is counted apart.
    const units = Array.from({ length: UNITS_ON_RECORD_BOUND.target + 3 }, (_, i) =>
      onRecord(`Company ${i}`, 'avoid'),
    );
    const goal = composeStepGoal(
      stepGoalInput({ mission: MISSION_WITH_IDENTITY, onRecord: { units, omitted: 7 } }),
    );
    expect(goal.match(/^ {2}- company "Company \d+"$/gm)).toHaveLength(
      UNITS_ON_RECORD_BOUND.target,
    );
    expect(goal).toContain(
      '  (3 more on record not listed)\n  (7 more on record the advisor counted and did not name)',
    );
    expect(goal).toContain('listed above or not, is refused by the session');
    // Only what the advisor left out: nothing cut from the listing.
    const counted = composeStepGoal(
      stepGoalInput({
        mission: MISSION_WITH_IDENTITY,
        onRecord: { units: units.slice(0, 2), omitted: 7 },
      }),
    );
    expect(counted).not.toContain('more on record not listed');
    expect(counted).toContain('  (7 more on record the advisor counted and did not name)');
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
