import {
  formObservation,
  MISSION_FIXTURE,
  MISSION_WITH_IDENTITY,
  MISSION_WITH_TAKEN,
  type UnitOnRecord,
} from '@sysdesign/contracts';
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
          'taskStart names company "Globex" (in progress in another session), a unit on record as forbidden: such a unit is never started; choose another item',
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

  it('[QL-66] a taskStart declaring it takes a unit on record is cut where the mission declares no exception, and where this page lists the control the mission ties the exception to; where the exception is open it runs, which unit it takes being the session’s to check', () => {
    const taking = taskStart('Senior Engineer at Acme', acme, true);
    expect(problems(samplePlan([taking]), declared).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          'taskStart declares onRecordTaken: the mission declares no exception for a unit on record, so none may be taken — choose another item',
      },
    ]);
    // The listing page lists the "Next page" button the fixture mission ties the exception to.
    expect(
      problems(samplePlan([taking]), stepGoal(undefined, undefined, MISSION_WITH_TAKEN)).limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          'taskStart declares onRecordTaken on a page that lists "Next page": the mission withholds its exception while the page does — choose another item',
      },
    ]);
    // The form page lists none: the declaration stands, whatever the record says of the unit.
    expect(
      problems(samplePlan([taking]), stepGoal(formObservation(), undefined, MISSION_WITH_TAKEN))
        .limits,
    ).toEqual([]);
    // A taskStart declaring nothing is held to no exception.
    expect(
      problems(
        samplePlan([taskStart('Senior Engineer at Acme', acme)]),
        stepGoal(undefined, undefined, MISSION_WITH_TAKEN),
      ).limits,
    ).toEqual([]);
  });
});
