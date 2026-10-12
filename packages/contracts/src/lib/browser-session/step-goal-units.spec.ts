import { describe, expect, it } from 'vitest';

import { UNITS_ON_RECORD_BOUND } from '../units/vocab';
import type { UnitOnRecord } from '../units/record';
import {
  listingObservation,
  MISSION_WITH_IDENTITY,
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

  it('[BRW-13] renders the units on record under Units of work, forbidden first with the engine’s meaning of each stance, each by its identity and the advisor’s note; only the forbidden ones reach the index and the Limits', () => {
    const goal = composeStepGoal(
      stepGoalInput({
        mission: MISSION_WITH_IDENTITY,
        onRecord: {
          units: [
            onRecord('Acme', 'avoid', 'applied 2026-10-03, 2 applications'),
            onRecord('Globex', 'forbid', 'in progress in another session'),
          ],
          omitted: 0,
        },
      }),
    );
    expect(goal).toContain(
      '- On record from earlier sessions, forbidden (never started — a taskStart naming one is cut):\n  - company "Globex" — in progress in another session\n- On record from earlier sessions, to avoid (prefer another item; the mission says when one of these may still be taken):\n  - company "Acme" — applied 2026-10-03, 2 applications',
    );
    expect(goal).toContain(
      '- A unit on record as forbidden is never started: a taskStart naming company "Globex" is cut. Choose another item.',
    );
    const index = readStepIndex(goal);
    expect(index?.unitsForbidden).toEqual([
      { identity: [{ name: 'company', value: 'Globex' }], note: 'in progress in another session' },
    ]);
    expect(JSON.stringify(index)).not.toContain('Acme');
  });

  it('[BRW-13] renders the bound and counts the rest, with what the advisor itself left out; a record with nothing in it renders nothing', () => {
    const units = Array.from({ length: UNITS_ON_RECORD_BOUND.target + 3 }, (_, i) =>
      onRecord(`Company ${i}`, 'avoid'),
    );
    const goal = composeStepGoal(
      stepGoalInput({ mission: MISSION_WITH_IDENTITY, onRecord: { units, omitted: 7 } }),
    );
    expect(goal.match(/^ {2}- company "Company \d+"$/gm)).toHaveLength(
      UNITS_ON_RECORD_BOUND.target,
    );
    expect(goal).toContain('  (10 more on record not listed)');
    const empty = composeStepGoal(stepGoalInput({ mission: MISSION_WITH_IDENTITY }));
    expect(empty).not.toContain('On record from earlier sessions');
    expect(empty).not.toContain('on record not listed');
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
