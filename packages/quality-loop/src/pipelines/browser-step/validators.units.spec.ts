import { MISSION_FIXTURE, MISSION_WITH_IDENTITY, type UnitOnRecord } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { click, samplePlan, stepGoal, taskStart } from './testing';
import { problems } from './validators.testing';

const declared = stepGoal(undefined, undefined, MISSION_WITH_IDENTITY);
const acme = [{ name: 'company', value: 'Acme' }];
const onRecord = (value: string, stance: UnitOnRecord['stance'], note = ''): UnitOnRecord => ({
  identity: [{ name: 'company', value }],
  stance,
  note,
});

describe('the browser-step validators on a unit’s declared identity', () => {
  it('[QL-66] a taskStart carries exactly the facets the mission declares — one missing, one undeclared or one repeated is cut at that action, and a mission declaring none takes none', () => {
    expect(
      problems(samplePlan([taskStart('Senior Engineer at Acme', acme)]), declared).limits,
    ).toEqual([]);
    expect(problems(samplePlan([taskStart()]), declared).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: "taskStart lacks company: a unit's identity is exactly company",
      },
    ]);
    expect(
      problems(
        samplePlan([taskStart('x', [...acme, { name: 'role', value: 'Staff Engineer' }])]),
        declared,
      ).limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          "taskStart names role, which the mission does not declare: a unit's identity is exactly company",
      },
    ]);
    expect(
      problems(
        samplePlan([taskStart('x', [...acme, { name: 'company', value: 'Acme Corp' }])]),
        declared,
      ).limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: "taskStart names company twice: a unit's identity is exactly company",
      },
    ]);
    // The fixture mission declares no identity: a taskStart with facets names what nobody could look up.
    expect(problems(samplePlan([taskStart('x', acme)])).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          "taskStart names company, which the mission does not declare: a unit's identity is no facet, since the mission declares none",
      },
    ]);
    expect(problems(samplePlan([taskStart()])).limits).toEqual([]);
  });

  it('[QL-66] a taskStart naming a unit on record as forbidden is cut with the record’s note and the alternative; one merely to avoid, or at another identity, runs', () => {
    const goal = stepGoal(undefined, undefined, MISSION_WITH_IDENTITY, {
      units: [
        onRecord('Globex', 'forbid', 'in progress in another session'),
        onRecord('Acme', 'avoid', 'applied 2026-10-03'),
      ],
      omitted: 0,
    });
    // The key is shared with the record: case and surrounding space do not escape it.
    expect(
      problems(
        samplePlan([
          taskStart('Staff Engineer at Globex', [{ name: 'company', value: ' globex' }]),
        ]),
        goal,
      ).limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          'taskStart names company "Globex", a unit on record as forbidden (in progress in another session): it is never started — choose another item',
      },
    ]);
    expect(problems(samplePlan([taskStart('Senior Engineer at Acme', acme)]), goal).limits).toEqual(
      [],
    );
    expect(
      problems(samplePlan([taskStart('x', [{ name: 'company', value: 'Globex Labs' }])]), goal)
        .limits,
    ).toEqual([]);
    // A plan with no taskStart is untouched by either rule.
    expect(problems(samplePlan([click('e3')]), goal).limits).toEqual([]);
    expect(goal).not.toBe(stepGoal(undefined, undefined, MISSION_FIXTURE));
  });
});
