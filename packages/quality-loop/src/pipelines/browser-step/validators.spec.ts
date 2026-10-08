import {
  dialogObservation,
  formObservation,
  listingObservation,
  MISSION_FIXTURE,
  openTaskLedger,
  type StepAction,
  type StepPlan,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { askFields, click, done, fill, samplePlan, select, stepGoal } from './testing';
import { limitsValidator, referencesValidator } from './validators';
import { form, listing, problems } from './validators.testing';

describe('the browser-step validators', () => {
  it('[QL-36] a plan over listed, enabled elements with its terminal action last passes both, and both cut rather than block', () => {
    expect(problems(samplePlan())).toEqual({ references: [], limits: [] });
    expect(problems(samplePlan([click('e3'), done()]))).toEqual({ references: [], limits: [] });
    expect(problems(samplePlan([askFields(['e1', 'e2']), select('e2', 'Yes')]), form)).toEqual({
      references: [],
      limits: [],
    });
    // Both CUT: a fault at action.3 refuses action.3 and after, never action.1,
    // and the lenses still judge the whole plan with the fault already counted.
    expect(referencesValidator.gate).toBe('cut');
    expect(limitsValidator.gate).toBe('cut');
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
    // The schema caps a plan at eight; the index can state a tighter limit. The
    // cut lands at the first action past it, so the actions within it run.
    const tighter = listing.replace('"maxActions":8', '"maxActions":1');
    expect(problems(samplePlan([click('e3'), click('e4')]), tighter).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.2'],
        message: '2 actions planned; the limit is 1',
      },
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

  it('[QL-36] a select is held to the listed options only when the list is whole: past a counted cut, the page decides', () => {
    const counted = stepGoal({
      ...formObservation(),
      elements: formObservation().elements.map((element) =>
        element.ref === 'e2' ? { ...element, optionsOmitted: 190 } : element,
      ),
    });
    expect(problems(samplePlan([select('e2', 'Maybe')]), counted).limits).toEqual([]);
    expect(problems(samplePlan([select('e2', 'Maybe')]), form).limits).toEqual([
      { severity: 'high', locationRefs: ['action.1'], message: '"Maybe" is not an option of e2' },
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

  it('[QL-36] an element carrying a word the mission declares as a mark is passed over: clicking, filling or selecting it is refused at that action', () => {
    // Measured 2026-10-07, twice live: told in prose to pass over a card whose
    // name carried "Applied", the planner clicked that card fifteen times in
    // one session, and the judges agreed with it. The mark is data the index
    // carries, and the rule needs no reading of prose.
    const marked = stepGoal(
      listingObservation(),
      undefined,
      `${MISSION_FIXTURE}\n\n## Marks\n\n- "Globex": not this one.\n`,
    );
    expect(marked).toContain('marked "Globex"');
    expect(problems(samplePlan([click('e4')]), marked).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          'e4 is marked "Globex": the mission passes such an item over, so it is never touched',
      },
    ]);
    // An unmarked element on the same page is untouched by the rule; a mission without Marks marks nothing.
    expect(problems(samplePlan([click('e3')]), marked).limits).toEqual([]);
    expect(problems(samplePlan([click('e4')])).limits).toEqual([]);
  });

  it('[QL-36] a disabled element binds only what touches it, and not after the fields are answered', () => {
    const waitForIt: StepPlan['actions'][number] = {
      kind: 'waitFor',
      until: 'element',
      value: 'e6',
      reason: 'wait for the control to enable',
      expect: null,
      serves: [],
    };
    const scrollToIt: StepPlan['actions'][number] = {
      kind: 'scroll',
      direction: 'down',
      ref: 'e6',
      reason: 'bring it into view',
      expect: null,
      serves: [],
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

  it('[QL-36] an element behind the open dialog, or one the page does not show, is not touched', () => {
    // Measured 2026-10-07: a form page listed 150 elements with the open
    // dialog's five fields among them unmarked, and the plans touched the
    // page behind it.
    const dialog = stepGoal(dialogObservation(), openTaskLedger());
    expect(problems(samplePlan([askFields(['e11', 'e12']), click('e13')]), dialog).limits).toEqual(
      [],
    );
    expect(problems(samplePlan([click('e3')]), dialog).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message: 'e3 is behind the open dialog: a person could not reach it',
      },
    ]);
    // Waiting for or scrolling to what is behind the dialog is no touch.
    const waitBehind: StepAction = {
      kind: 'waitFor',
      until: 'element',
      value: 'e3',
      reason: 'w',
      expect: null,
      serves: [],
    };
    expect(problems(samplePlan([waitBehind]), dialog).limits).toEqual([]);
    // Not visible and not a trap: refused as not visible, never guessed at.
    const unseen = stepGoal({
      ...listingObservation(),
      elements: listingObservation().elements.map((element) =>
        element.ref === 'e3' ? { ...element, visible: false } : element,
      ),
    });
    expect(problems(samplePlan([click('e3')]), unseen).limits).toEqual([
      { severity: 'high', locationRefs: ['action.1'], message: 'e3 is not visible' },
    ]);
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
    const broken = { assessment: 'a page, and no actions' } as unknown as StepPlan;
    expect(problems(broken)).toEqual({ references: [], limits: [] });
  });
});
