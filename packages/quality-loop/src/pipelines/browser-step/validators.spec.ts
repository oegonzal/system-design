import {
  dialogObservation,
  formObservation,
  listingObservation,
  openTaskLedger,
  type StepAction,
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
  terminate,
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

  it('[QL-36] a claim rests on the page as observed: a taskDone or terminate after an action that could change the page is refused there', () => {
    // Measured 2026-10-07: `taskStart, askFields, click Next, taskDone done`
    // on page 1 of 9 of an application form. The task rule that voided it is
    // gone — a redundant taskStart is the executor's to skip — and without
    // this rule the plan would run whole and close the session's one unit of
    // work as done on the far side of the click.
    const open = stepGoal(formObservation(), openTaskLedger());
    expect(
      problems(samplePlan([taskStart(), askFields(['e1', 'e2']), click('e6'), taskDone()]), open)
        .limits,
    ).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.4'],
        message:
          'taskDone follows the askFields at action.2: it claims what the page shows, and that page has not been observed',
      },
    ]);
    // Every action that could change the page: a navigate, a touch, a key, the fields.
    for (const first of [
      click('e6'),
      fill('e1', '6'),
      select('e2', 'Yes'),
      { kind: 'press', key: 'Enter', reason: 'submit', expect: null } as StepAction,
    ]) {
      expect(
        problems(samplePlan([first, taskDone()]), open).limits.map((p) => p.locationRefs),
      ).toEqual([['action.2']]);
      expect(problems(samplePlan([first, terminate()]), open).limits).toHaveLength(1);
    }
    // A claim on the page as observed stands: first, or after actions that change nothing.
    const scrollDown: StepAction = {
      kind: 'scroll',
      direction: 'down',
      ref: null,
      reason: 'look',
      expect: null,
    };
    const waitHere: StepAction = {
      kind: 'waitFor',
      until: 'element',
      value: 'e6',
      reason: 'w',
      expect: null,
    };
    expect(problems(samplePlan([taskDone()]), open).limits).toEqual([]);
    expect(problems(samplePlan([taskDone(), terminate()]), open).limits).toEqual([]);
    expect(problems(samplePlan([scrollDown, waitHere, taskDone()]), open).limits).toEqual([]);
    // `done` claims nothing, so it may follow anything.
    expect(problems(samplePlan([askFields(['e1']), click('e6'), done()]), open).limits).toEqual([]);
  });

  it('[QL-36] a redundant taskStart or taskDone is not a reason to refuse a plan: the executor records and skips it, so the browser actions beside it still run', () => {
    // Measured 2026-10-07: five of seven plans on an application form were
    // voided whole at action.1 for a taskStart while the unit was already
    // open, their correct askFields and click Next never run.
    const openGoal = stepGoal(listingObservation(), openTaskLedger());
    expect(problems(samplePlan([taskStart(), click('e3')]), openGoal).limits).toEqual([]);
    expect(problems(samplePlan([taskDone()])).limits).toEqual([]);
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
    const broken = { pageKind: 'listing' } as unknown as StepPlan;
    expect(problems(broken)).toEqual({ references: [], limits: [] });
  });

  it('[QL-36] lets a taskDone stand before a terminate, because closing a unit of work touches no page', () => {
    // Measured live on two providers: both reached for `taskDone, terminate`
    // as a mission's last plan, both were refused, and both tried again until
    // the failure rail ended the session. The pair is the natural final
    // thought and costs an extra observation and an extra model call to say
    // in two plans.
    const open = stepGoal(listingObservation(), openTaskLedger());
    expect(problems(samplePlan([taskDone(), terminate()]), open).limits).toEqual([]);
    expect(problems(samplePlan([taskDone(), done()]), open).limits).toEqual([]);

    // What may follow is still only ever the one closing action, and only after
    // a taskDone: anything else after a terminal action touches a page this
    // plan never observed.
    expect(problems(samplePlan([taskDone(), terminate(), done()]), open).limits).not.toEqual([]);
    expect(problems(samplePlan([taskDone(), click('e3')]), open).limits).not.toEqual([]);
    expect(problems(samplePlan([terminate(), done()]), open).limits).toEqual([
      expect.objectContaining({ message: 'terminate must be the last action' }),
    ]);
    // And the refusal says the way through, rather than only what is refused.
    expect(problems(samplePlan([taskDone(), click('e3')]), open).limits[0]?.message).toBe(
      'taskDone must be the last action, or the one before terminate or done',
    );
  });

  it('[QL-36] a terminate or taskDone on a page that shows nothing is refused there: no stop condition or outcome is shown to rest it on', () => {
    // Measured 2026-10-07: twelve plans in a row terminated an empty document
    // for a limit the page could not show. Read from the index's own account of
    // the observation, never from a URL, a word or a page kind.
    const blank = stepGoal({ ...listingObservation(), elements: [], ariaSnapshot: '' });
    expect(problems(samplePlan([terminate()]), blank).limits).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.1'],
        message:
          'terminate on a page that shows nothing: no stop condition or outcome is shown to rest it on — wait for, or navigate to, the page the mission names',
      },
    ]);
    const open = stepGoal(
      { ...listingObservation(), elements: [], ariaSnapshot: '' },
      openTaskLedger(),
    );
    expect(problems(samplePlan([taskDone()]), open).limits.map((p) => p.message)).toEqual([
      expect.stringContaining('taskDone on a page that shows nothing'),
    ]);
    // A page that shows something — one element, or one line of snapshot — may be terminated on.
    expect(problems(samplePlan([terminate()]), stepGoal()).limits).toEqual([]);
    const snapshotOnly = stepGoal({
      ...listingObservation(),
      elements: [],
      ariaSnapshot: '- text "No more results"',
    });
    expect(problems(samplePlan([terminate()]), snapshotOnly).limits).toEqual([]);
  });

  it('[QL-36] an action after one that replaces the page is refused at that action — the Limits say it, and this is where it is enforced', () => {
    // Measured on 2026-10-07: six plans in a row put a navigate at action.1 and
    // two to five actions after it, citing refs on a page nobody had observed.
    // The references rule caught the refs at action.3; the first fault was at
    // action.2, and nothing said so. Now the cut lands where the page changes.
    const navigate: StepAction = {
      kind: 'navigate',
      url: 'https://jobs.example.test/search',
      reason: 'open the search',
      expect: 'the results',
    };
    expect(problems(samplePlan([navigate])).limits).toEqual([]);
    const beyond = problems(samplePlan([click('e3'), navigate, click('e4'), done()])).limits;
    expect(beyond).toEqual([
      {
        severity: 'high',
        locationRefs: ['action.3'],
        message:
          'click follows the navigate at action.2: the page it would act on has not been observed',
      },
      {
        severity: 'high',
        locationRefs: ['action.4'],
        message:
          'done follows the navigate at action.2: the page it would act on has not been observed',
      },
    ]);
    // Read from the declared table, never from a kind's name: a click may or
    // may not replace the page, so a click is never the action this cuts after.
    expect(problems(samplePlan([click('e3'), click('e4')])).limits).toEqual([]);

    // A wait for text or a URL is the plan's own word that the page will
    // change: what follows it is planned on the page waited for. A wait for a
    // listed element is a wait on this page, and cuts nothing.
    const waitText: StepAction = {
      kind: 'waitFor',
      until: 'text',
      value: 'Results',
      reason: 'r',
      expect: null,
    };
    const waitElement: StepAction = {
      kind: 'waitFor',
      until: 'element',
      value: 'e5',
      reason: 'r',
      expect: null,
    };
    expect(
      problems(
        samplePlan([click('e3'), waitText, taskDone()]),
        stepGoal(listingObservation(), openTaskLedger()),
      ).limits,
    ).toEqual([
      expect.objectContaining({
        locationRefs: ['action.3'],
        message:
          'taskDone follows the waitFor at action.2: the page it would act on has not been observed',
      }),
    ]);
    expect(problems(samplePlan([waitElement, click('e3')])).limits).toEqual([]);
  });
});
