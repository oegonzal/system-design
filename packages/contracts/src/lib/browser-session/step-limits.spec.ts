import { describe, expect, it } from 'vitest';

import { NO_UNITS_ON_RECORD } from '../units/record';
import { emptyLedger, listingObservation, MISSION_FIXTURE, stepGoalInput } from './fixtures';
import { MissionMarkMalformed } from './mission-marks';
import { stopsOf, stopsOnPage } from './mission-stops';
import { type PageObservation, type StepObjection } from './observation.schema';
import { composeStepGoal } from './step-goal';
import { readStepIndex } from './step-index';
import { ACTIONS_BOUND } from './step-plan.schema';

const NO_PROGRESS = { criteria: [], settled: [], done: [] };

const goalOf = (
  observation: PageObservation,
  history = [],
  ledger = emptyLedger(),
  objections: readonly StepObjection[] = [],
) =>
  composeStepGoal(
    stepGoalInput({ observation, history, ledger, objections, progress: NO_PROGRESS }),
  );

describe('the Limits a step goal states', () => {
  it('[BRW-8] renders a mark the mission declares beside every element that carries it, writes it into the index, and says the rule in the Limits', () => {
    // Measured 2026-10-07: a card name of 200 characters buried the one word
    // that said the listing was applied to; told in prose, the planner read
    // the words around it and clicked the card fifteen times.
    const marked = `${MISSION_FIXTURE}\n\n## Marks\n\n- "Globex": not this one.\n- "Acme": the house account.\n`;
    const goal = composeStepGoal(stepGoalInput({ mission: marked }));
    expect(goal).toMatch(/^- e4 · link · "Staff Engineer — Globex" · marked "Globex"$/m);
    expect(goal).toMatch(/^- e3 · link · "Senior Engineer — Acme" · marked "Acme"$/m);
    expect(goal).toContain(
      '- An element marked "Globex" or "Acme" carries a word the mission\'s Marks declare: it is passed over — never clicked, filled or selected, and never a unit of work.',
    );
    const index = readStepIndex(goal);
    expect(index?.elements.map((element) => [element.ref, element.marks])).toEqual([
      ['e1', []],
      ['e2', []],
      ['e3', ['Acme']],
      ['e4', ['Globex']],
      ['e5', []],
      ['e6', []],
    ]);
    // A mission without Marks marks nothing and says nothing about marks.
    const plain = goalOf(listingObservation());
    expect(plain).not.toContain('marked "');
    expect(plain).not.toContain('Marks declare');
    expect(readStepIndex(plain)?.elements.every((element) => element.marks.length === 0)).toBe(
      true,
    );
    // A Marks line the grammar does not read refuses the goal before any page is planned against it.
    expect(() =>
      composeStepGoal(
        stepGoalInput({ mission: `${MISSION_FIXTURE}\n\n## Marks\n\n- Globex without quotes\n` }),
      ),
    ).toThrow(MissionMarkMalformed);
  });

  it('[QL-39] on an unchanged page says what ran at the last step, writes it into the index by this observation’s refs, and says the rule in the Limits', () => {
    // Measured 2026-10-08: nine of 31 steps were one click on one already-selected
    // card, repeated, each on a page the step before had left unchanged.
    const ran = [
      { kind: 'click' as const, role: 'link', name: 'Senior Engineer — Acme', detail: null },
      { kind: 'press' as const, role: null, name: null, detail: 'Enter' },
      { kind: 'click' as const, role: 'button', name: 'Gone from this page', detail: null },
    ];
    const input = (pageUnchanged: boolean) => ({
      mission: MISSION_FIXTURE,
      observation: listingObservation(),
      history: [],
      ledger: emptyLedger(),
      objections: [],
      progress: { criteria: [], settled: [], done: [] },
      pageUnchanged,
      lastStep: { ran: ran.length, touched: ran, held: [] },
      stops: stopsOnPage(stopsOf(MISSION_FIXTURE), listingObservation()),
      onRecord: NO_UNITS_ON_RECORD,
    });
    const unchanged = composeStepGoal(input(true));
    expect(unchanged).toContain(
      'The last step ran click link "Senior Engineer — Acme"; press "Enter"; click button "Gone from this page" and this page did not change — repeating any of these is cut.',
    );
    expect(readStepIndex(unchanged)).toMatchObject({
      pageUnchanged: true,
      lastRan: [
        { kind: 'click', ref: 'e3', detail: null },
        { kind: 'press', ref: null, detail: 'Enter' },
        { kind: 'click', ref: null, detail: null },
      ],
    });
    expect(unchanged).toContain(
      '- On a page unchanged since the last plan, an action that ran at the last step — the same kind on the same element by role and name, with the same value, option, key or URL — is cut: the page already answered it.',
    );
    // A page that moved carries neither the line nor the index entries: what ran is history, not a repeat.
    const moved = composeStepGoal(input(false));
    expect(moved).not.toContain('this page did not change');
    expect(readStepIndex(moved)).toMatchObject({ pageUnchanged: false, lastRan: [] });
  });

  it('[QL-36] says in the Limits what the validators refuse, including that the action cap is a ceiling and not a quota', () => {
    const goal = goalOf(listingObservation());

    // `references` refuses a ref the current observation did not list, so the
    // section that exists to say what the validators enforce has to say that an
    // Elements list belongs to one observation. Measured on 2026-10-06: without
    // it, five of eight plans navigated and then cited refs for the page they
    // had not opened yet, and every one of them was refused.
    expect(goal).toContain('belongs to this observation alone');
    // And not only what it may cite — what it may claim: a `taskDone` after a
    // submit names no ref and still asserts a page nobody has observed.
    expect(goal).toMatch(/navigates.*is the LAST action of the plan/);
    expect(goal).toContain('closing a unit of work and terminating included');
    // And a claim rests on the page as observed: never after an action that could change it.
    expect(goal).toContain('press or askFields, never after');

    // And a cap reads as a quota unless it says otherwise: asked for "at most
    // 8", the same producer returned seven or eight nearly every time.
    expect(goal).toContain('never a number to reach');
    expect(goal).toContain(`At most ${ACTIONS_BOUND.target} actions`);

    // Still said once, where the validators' own rules are said.
    expect(goal.split('belongs to this observation alone')).toHaveLength(2);
  });
});
