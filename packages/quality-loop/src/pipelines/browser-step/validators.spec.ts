import {
  formObservation,
  listingObservation,
  openTaskLedger,
  type StepPlan,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { contractOf } from '../../core/testing';
import { BROWSER_STEP } from './definition';
import {
  askFields,
  click,
  done,
  fill,
  samplePlan,
  select,
  stepGoal,
  taskDone,
  taskStart,
} from './testing';
import { limitsValidator, referencesValidator } from './validators';

const listing = stepGoal();
const form = stepGoal(formObservation());

const problems = (plan: StepPlan, goal = listing) => {
  const contract = contractOf(BROWSER_STEP.task, goal);
  return {
    references: referencesValidator.validate(plan, contract).problems,
    limits: limitsValidator.validate(plan, contract).problems,
  };
};

describe('the browser-step validators', () => {
  it('[QL-36] a plan over listed, enabled elements with its terminal action last passes both, and both block', () => {
    expect(problems(samplePlan())).toEqual({ references: [], limits: [] });
    expect(problems(samplePlan([click('e3'), done()]))).toEqual({ references: [], limits: [] });
    expect(problems(samplePlan([askFields(['e1', 'e2']), select('e2', 'Yes')]), form)).toEqual({
      references: [],
      limits: [],
    });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
  });

  it('[QL-36] a ref the page did not offer blocks at its action, before any lens', () => {
    const { references, limits } = problems(samplePlan([click('e3'), click('e9')]));
    expect(references).toEqual([
      { severity: 'critical', locationRefs: ['action.2'], message: 'e9 is not a listed element' },
    ]);
    // An unlisted ref has no element to check limits against; the references rule owns it.
    expect(limits).toEqual([]);
    expect(problems(samplePlan([askFields(['e1', 'e7'])]), form).references).toEqual([
      { severity: 'critical', locationRefs: ['action.1'], message: 'e7 is not a listed element' },
    ]);
  });

  it('[QL-36] a disabled element, a terminal action out of place and too many actions block', () => {
    expect(problems(samplePlan([click('e6')])).limits).toEqual([
      { severity: 'high', locationRefs: ['action.1'], message: 'e6 is disabled' },
    ]);
    expect(problems(samplePlan([done(), click('e3')])).limits).toEqual([
      { severity: 'high', locationRefs: ['action.1'], message: 'done must be the last action' },
    ]);
    // The schema caps a plan at eight; the index can state a tighter limit.
    const tighter = listing.replace('"maxActions":8', '"maxActions":1');
    expect(problems(samplePlan([click('e3'), click('e4')]), tighter).limits).toEqual([
      { severity: 'high', locationRefs: [], message: '2 actions planned; the limit is 1' },
    ]);
    expect(listing).not.toBe(tighter);
  });

  it('[QL-36] fill only on what can be typed into, select only a listed option, askFields only on fields', () => {
    expect(problems(samplePlan([fill('e5', 'x')]), form).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: 'e5 cannot be typed into (clickable)',
      },
    ]);
    expect(problems(samplePlan([select('e2', 'Maybe')]), form).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: '"Maybe" is not an option of e2',
      },
    ]);
    expect(problems(samplePlan([select('e1', 'Yes')]), form).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: 'e1 offers nothing to select (fillable)',
      },
    ]);
    expect(problems(samplePlan([askFields(['e1', 'e5'])]), form).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: 'e5 is not a field to answer (clickable)',
      },
    ]);
  });

  it('[QL-36] touching an element the page hides — typing, selecting or clicking — is critical: the DOM half of a trap left blank', () => {
    const [hidden] = problems(
      samplePlan([click('e4'), fill('e3', 'https://alex.example')]),
      form,
    ).limits;
    const message =
      'e3 is hidden (offscreen, autocomplete-off-bait); an element the page hides is never touched';
    expect(hidden).toEqual({ severity: 'critical', locationRefs: ['action.2'], message });
    expect(problems(samplePlan([click('e3')]), form).limits).toEqual([
      { severity: 'critical', locationRefs: ['action.1'], message },
    ]);
    // Asking about it is not an interaction with it: the field-answer pipeline leaves it blank.
    expect(problems(samplePlan([askFields(['e3'])]), form).limits).toEqual([]);
  });

  it('[QL-36] a disabled element binds only what touches it, and not after the fields are answered', () => {
    const waitForIt: StepPlan['actions'][number] = {
      kind: 'waitFor',
      until: 'element',
      value: 'e6',
      reason: 'wait for the control to enable',
      expect: null,
    };
    const scrollToIt: StepPlan['actions'][number] = {
      kind: 'scroll',
      direction: 'down',
      ref: 'e6',
      reason: 'bring it into view',
      expect: null,
    };
    // Waiting for or scrolling to a disabled control is how a wizard page is worked, not a touch.
    expect(problems(samplePlan([waitForIt, scrollToIt, done()])).limits).toEqual([]);
    // A Next control disabled until the fields are filled: the click after askFields is not held to it.
    expect(problems(samplePlan([askFields(['e1']), click('e6')])).limits).toEqual([]);
    // Before any fields are answered, the same click is refused.
    expect(problems(samplePlan([click('e6'), askFields(['e1'])])).limits).toEqual([
      { severity: 'high', locationRefs: ['action.1'], message: 'e6 is disabled' },
    ]);
  });

  it('[QL-36] a unit of work opens only while none is open and closes only while one is, tracked through the plan', () => {
    expect(problems(samplePlan([click('e3'), taskDone()])).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.2'],
        message: 'taskDone while no unit of work is open',
      },
    ]);
    const openGoal = stepGoal(listingObservation(), openTaskLedger());
    expect(problems(samplePlan([taskStart()]), openGoal).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: 'taskStart while a unit of work is already open',
      },
    ]);
    expect(problems(samplePlan([taskStart(), click('e3'), taskDone()])).limits).toEqual([]);
    expect(problems(samplePlan([click('e3'), taskDone()]), openGoal).limits).toEqual([]);
  });

  it('[QL-36] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    expect(problems(samplePlan(), 'Just a mission.')).toEqual({
      references: [
        {
          severity: 'critical',
          locationRefs: [],
          message: 'the goal carries no browser-step index',
        },
      ],
      limits: [],
    });
    const broken = { pageKind: 'listing' } as unknown as StepPlan;
    expect(problems(broken)).toEqual({ references: [], limits: [] });
  });
});
