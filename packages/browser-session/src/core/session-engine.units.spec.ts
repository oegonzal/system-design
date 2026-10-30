import {
  formObservation,
  MISSION_FIXTURE,
  MISSION_WITH_CONTEXT,
  type UnitFacet,
} from '@sysdesign/contracts';

import { decidedAnswers, decidedPlan, FakeBrowser, type ScriptedPage } from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages,
  nextUnitPlan,
} from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * What a session records of one unit of work and reads back only for it: the
 * key the open unit is named by reaches the form's goal and the answers taught
 * in it alike, an answer the operator gave — or any value the session settled
 * into a field — stands for the unit it was given in alone, and what the page
 * stated about the unit as it opened travels with it to the answerer and into
 * the dump, and nowhere else.
 */

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
        nextUnitPlan(second),
        PLANS.formAgain,
        PLANS.end,
      ].map((plan) => decidedPlan(plan)),
      answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
    },
    lines,
    browser: new FakeBrowser(pages),
  });
};

/** The journey with its results page stating, under the given landmarks, what the listing is. */
const statingPages = (states: ScriptedPage['states']): ScriptedPage[] =>
  journeyPages().map((page) => (page.id === 'results' ? { ...page, states } : page));

/** One unit through the whole journey under the given mission, the operator answering the one asked field. */
const oneUnit = (mission: string, pages: ScriptedPage[]) =>
  run({
    script: {
      plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((plan) =>
        decidedPlan(plan),
      ),
      answers: [decidedAnswers(ANSWERS)],
    },
    mission,
    lines: ['Yes'],
    browser: new FakeBrowser(pages),
  });

describe('what a unit of work carries of the page that opened it', () => {
  const STATED = ['Acme builds tools for teams.', 'Senior Engineer — Acme', 'Remote'];

  it('[BRW-16] captures, as the unit opens, every word under the landmark its mission declares, carries it to the answerer and records it in the tasks dump — never on a row or the bus', async () => {
    const { brain, dumps, detail, events } = await oneUnit(
      MISSION_WITH_CONTEXT,
      statingPages({ main: STATED, banner: ['Jobs'] }),
    );
    const context = { landmark: 'main', text: STATED.join('\n'), omitted: 0 };
    expect(brain.fieldInputs.map((input) => input.task?.context)).toEqual([context]);
    expect(JSON.parse(dumps.text('02-tasks.json'))).toMatchObject([
      { label: 'Senior Engineer at Acme', context },
    ]);
    expect(detail.tasks[0]).not.toHaveProperty('context');
    expect(JSON.stringify(events.published)).not.toContain('"context"');
  });

  it('[BRW-16] carries nothing when the mission declares no landmark, or when the page lays out none', async () => {
    const declaredNone = await oneUnit(MISSION_FIXTURE, statingPages({ main: STATED }));
    expect(declaredNone.brain.fieldInputs.map((input) => input.task?.context)).toEqual([null]);
    expect(JSON.parse(declaredNone.dumps.text('02-tasks.json'))).toMatchObject([{ context: null }]);
    const noMain = await oneUnit(MISSION_WITH_CONTEXT, statingPages({ banner: STATED }));
    expect(noMain.brain.fieldInputs.map((input) => input.task?.context)).toEqual([null]);
  });
});

describe('what a session keeps of one unit of work', () => {
  it('[BRW-16] [BRW-17] names the open unit the same way to the form it answers and in the answers it teaches: by its own row id when its mission declares no identity', async () => {
    const { brain, detail } = await twoUnits([], [], ['Yes', 'No']);
    const [first, second] = detail.tasks;
    expect(brain.fieldInputs.map((input) => input.task?.unitKey)).toEqual([first?.id, second?.id]);
    expect(brain.taught.map((call) => call.answers[0]?.context.unitKey)).toEqual([
      first?.id,
      second?.id,
    ]);
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
