import {
  formObservation,
  type StepAction,
  type StepPlan,
  type UnitFacet,
} from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FakeBrowser, type ScriptedPage } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages,
  JOURNEY_URLS,
} from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * What a session records of one unit of work and reads back only for it: the
 * key the open unit is named by reaches the form's goal and the answers taught
 * in it alike, and an answer the operator gave — or any value the session
 * settled into a field — stands for the unit it was given in alone.
 */

const common = { reason: 'the procedure says so', expect: null, serves: [] };

/** The journey, its confirmation page leading back to a form, so a second unit asks the same fields. */
const twoUnitPages = (next = 'form'): ScriptedPage[] =>
  journeyPages().map((page) =>
    page.id === 'done' ? { ...page, transitions: { 'click e1': next } } : page,
  );

/** The second form showing the answer the first was given, as a site that remembers an applicant's answers does. */
const rememberingPages = (): ScriptedPage[] => {
  const form = formObservation();
  const elements = form.elements.map((element) =>
    element.ref === 'e2' ? { ...element, value: 'Yes' } : element,
  );
  return [
    ...twoUnitPages('remembered'),
    { id: 'remembered', observation: { ...form, elements }, transitions: { 'click e6': 'done' } },
  ];
};

/** On the confirmation page: the first unit closes and the next one opens on the form again. */
const nextUnit = (facets: UnitFacet[]): StepPlan => ({
  assessment: 'the application was sent; the next listing is on the same form',
  actions: [
    { kind: 'taskDone', outcome: 'done', detail: 'sent', ...common },
    {
      kind: 'taskStart',
      label: 'Staff Engineer at Globex',
      url: JOURNEY_URLS.listing,
      facets,
      ...common,
    } satisfies StepAction,
    { kind: 'click', ref: 'e1', ...common },
  ],
});

/** Two units whose forms ask the same question, the first unit opened with these facets. */
const twoUnits = (
  first: UnitFacet[],
  second: UnitFacet[],
  lines: string[],
  pages: ScriptedPage[] = twoUnitPages(),
) => {
  const opening = PLANS.results.actions.map((action) =>
    action.kind === 'taskStart' ? { ...action, facets: first } : action,
  );
  return run({
    script: {
      plans: [
        PLANS.search,
        { ...PLANS.results, actions: opening },
        PLANS.form,
        nextUnit(second),
        PLANS.formAgain,
        PLANS.end,
      ].map((plan) => decidedPlan(plan)),
      answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
    },
    lines,
    browser: new FakeBrowser(pages),
  });
};

describe('what a session keeps of one unit of work', () => {
  it('[BRW-16] [BRW-17] names the open unit the same way to the form it answers and in the answers it teaches: by its own row id when its mission declares no identity', async () => {
    const { brain, detail } = await twoUnits([], [], ['Yes', 'No']);
    const [first, second] = detail.tasks;
    expect(brain.fieldInputs.map((input) => input.task?.unitKey)).toEqual([first?.id, second?.id]);
    expect(brain.taught.map((document) => document.unitKey)).toEqual([first?.id, second?.id]);
  });

  it('[BRW-3] puts an answer back for an ask only in the unit of work it was given in, and a unit of the same declared identity is that unit', async () => {
    // Two units with nothing declared: the second is asked again, and its answer stands.
    const apart = await twoUnits([], [], ['Yes', 'No']);
    expect(apart.operator.questions).toHaveLength(2);
    const asked = apart.detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 5);
    expect(asked).toMatchObject({ source: 'operator', answer: 'No' });
    expect(asked?.payload['cached']).toBe(false);

    // Two units of one declared identity are one unit: the answer given in the first fills the second.
    const acme = [{ name: 'company', value: 'Acme' }];
    const same = await twoUnits(acme, [{ name: 'company', value: 'ACME' }], ['Yes']);
    expect(same.operator.questions).toHaveLength(1);
    const filled = same.detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 5);
    expect(filled).toMatchObject({ source: 'operator', answer: 'Yes' });
    expect(filled?.payload['cached']).toBe(true);
    expect(same.brain.fieldInputs.map((input) => input.task?.unitKey)).toEqual([
      'company=acme',
      'company=acme',
    ]);
  });

  it('[BRW-3] keeps a field for holding what the session settled only in the unit of work it was settled in: another unit’s form showing that value is decided again', async () => {
    // The second unit's field goes to a run of its own, never kept for the value the first settled.
    const apart = await twoUnits([], [], ['Yes'], rememberingPages());
    expect(apart.brain.fieldInputs[1]?.fields.map((field) => field.ref)).toEqual(['e2']);
    const decided = apart.detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 5);
    expect(decided).toMatchObject({ source: 'loop' });
    expect(decided?.payload['cached']).toBe(false);

    // In a unit of the same declared identity the value stands, with no run.
    const acme = [{ name: 'company', value: 'Acme' }];
    const same = await twoUnits(acme, acme, ['Yes'], rememberingPages());
    expect(same.brain.fieldInputs).toHaveLength(1);
    const kept = same.detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 5);
    expect(kept).toMatchObject({ source: 'engine', answer: 'Yes' });
    expect(kept?.payload).toMatchObject({ route: 'keep', cached: true });
  });
});
