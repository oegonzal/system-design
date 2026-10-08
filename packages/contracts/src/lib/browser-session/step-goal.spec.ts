import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GOAL_BUDGET_BYTES, GoalBudgetExceeded, textBytes } from '../quality-loop/goal-index';
import {
  dialogObservation,
  emptyLedger,
  formObservation,
  listingObservation,
  MISSION_FIXTURE,
  openTaskLedger,
} from './fixtures';
import type { ObservedElement, PageObservation } from './observation.schema';
import {
  ELEMENTS_BOUND,
  OBJECTION_AT_BOUND,
  OBJECTION_DETAIL_BOUND,
  OBJECTIONS_BOUND,
  OPTIONS_SHOWN,
  pageObservationSchema,
  type StepObjection,
  CLOSED_TASKS_BOUND,
  TASK_LABEL_BOUND,
} from './observation.schema';
import { MissionMarkMalformed } from './mission-marks';
import { composeStepGoal, readStepIndex, renderElementLine } from './step-goal';
import { ACTIONS_BOUND, stepActionSchema, stepPlanSchema } from './step-plan.schema';
import { STEP_ACTION_KINDS } from './vocab';

const NO_PROGRESS = { criteria: [], settled: [], done: [] };

/** The goal's text between two of its headings, which must both be there. */
const between = (goal: string, heading: string, next: string): string => {
  const start = goal.indexOf(heading);
  const end = start < 0 ? -1 : goal.indexOf(next, start);
  if (end < 0) throw new Error(`the goal has no ${heading} followed by ${next}`);
  return goal.slice(start + heading.length, end);
};

const goalOf = (
  observation: PageObservation,
  history = [],
  ledger = emptyLedger(),
  objections: readonly StepObjection[] = [],
) =>
  composeStepGoal({
    mission: MISSION_FIXTURE,
    observation,
    history,
    ledger,
    objections,
    progress: NO_PROGRESS,
    pageUnchanged: false,
  });

/** One objection at its declared ceiling, as a maximal goal would carry it. */
const maximalObjection = (step: number): StepObjection => ({
  step,
  from: 'misread_page',
  at: Array.from({ length: OBJECTION_AT_BOUND.target }, (_, i) => `action.${i + 1}`),
  detail: 'd'.repeat(OBJECTION_DETAIL_BOUND.target),
});

describe('composeStepGoal', () => {
  it('[QL-39] writes an index the validators read back: every ref, its kind and facts, and whether a unit is open', () => {
    const observation = listingObservation();
    const index = readStepIndex(goalOf(observation, [], openTaskLedger()));
    expect(index).not.toBeNull();
    expect(index?.pipeline).toBe('browser-step');
    expect(index?.maxActions).toBe(ACTIONS_BOUND.target);
    expect(index?.elements.map((e) => e.ref)).toEqual(observation.elements.map((e) => e.ref));
    expect(index?.elements.every((e) => e.visible && !e.behind)).toBe(true);
    expect(index?.elements.find((e) => e.ref === 'e6')?.disabled).toBe(true);
    expect(index?.elements.find((e) => e.ref === 'e1')?.kind).toBe('fillable');
    expect(index?.pageShowsContent).toBe(true);
    // Nothing listed and a snapshot reduced to nothing: the page shows nothing, and the index says so —
    // read from the rung, so a note line saying what was not shown is never taken for content.
    const empty = {
      ...observation,
      elements: [],
      ariaSnapshot: '[snapshot reduced to none: 1418 of 1418 lines not shown]',
      snapshotRung: 'none' as const,
    };
    expect(readStepIndex(goalOf(empty))?.pageShowsContent).toBe(false);
  });

  it('[QL-39] keeps the index last, so a snapshot carrying its own fenced block does not disturb it', () => {
    const observation = {
      ...listingObservation(),
      ariaSnapshot: 'text\n```json\n{"pipeline":"browser-step","maxActions":1}\n```\nmore',
    };
    expect(readStepIndex(goalOf(observation))?.maxActions).toBe(ACTIONS_BOUND.target);
  });

  /**
   * A busy listing page: the element cap reached, every tenth element a
   * select with a handful of options, context on a fifth of them, the
   * mission at its cap, and no snapshot — the snapshot's room is whatever
   * the rest leaves, and the session's composer fits it there. Options are
   * listed twice — for the model and in the index — so a page of long
   * selects is the one shape that does not fit; the session degrades such a
   * page before composing.
   */
  it('[QL-39] renders a plausible maximal page under the engine budget, with room left for a snapshot', () => {
    const elements: ObservedElement[] = Array.from({ length: ELEMENTS_BOUND.target }, (_, i) => ({
      ref: `e${i + 1}`,
      role: i % 10 === 0 ? 'combobox' : 'link',
      name: 'x'.repeat(60),
      text: null,
      kind: i % 10 === 0 ? 'selectable' : 'clickable',
      inputType: null,
      value: null,
      options: i % 10 === 0 ? Array.from({ length: 6 }, (__, j) => `option number ${j}`) : null,
      optionsOmitted: 0,
      required: i % 10 === 0,
      invalid: false,
      disabled: false,
      visible: true,
      maxLength: null,
      hiddenTraits: [],
      context: i % 5 === 0 ? 'c'.repeat(80) : null,
      scope: null,
    }));
    const observation = pageObservationSchema.parse({
      ...listingObservation(),
      elements,
      omittedElements: 12,
      snapshotRung: 'full',
      ariaSnapshot: '',
    });
    const goal = composeStepGoal({
      mission: 'm'.repeat(6_000),
      observation,
      history: Array.from({ length: 10 }, (_, i) => ({
        action: `click e${i} "${'n'.repeat(100)}"`,
        outcome: 'ok' as const,
        note: 'o'.repeat(200),
      })),
      // The closed units at their bound, each label at its target, plus older ones counted.
      ledger: {
        ...openTaskLedger(),
        closed: Array.from({ length: CLOSED_TASKS_BOUND.target }, (_, i) => ({
          label: `${'l'.repeat(TASK_LABEL_BOUND.target - 2)}${String(i).padStart(2, '0')}`,
          outcome: 'done' as const,
        })),
        closedOmitted: 3,
      },
      // Every objection the goal will carry, each at its ceiling, plus more
      // than it carries — the budget has to hold the worst case, not the mean.
      objections: Array.from({ length: OBJECTIONS_BOUND.target + 3 }, (_, i) =>
        maximalObjection(i + 1),
      ),
      // A long rubric with half of it settled: each settled statement is printed whole.
      progress: {
        criteria: Array.from({ length: 24 }, (_, i) => ({
          id: `c${i + 1}`,
          kind: 'progress',
          statement: 's'.repeat(400),
        })),
        settled: Array.from({ length: 12 }, (_, i) => `c${i + 1}`),
        done: ['c13'],
      },
      pageUnchanged: false,
    });
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    // The room such a page leaves a snapshot: measured 2026-10-07, a dialog of
    // twenty-odd lines is about 2 KB, and the scope rung keeps it whole.
    expect(GOAL_BUDGET_BYTES - textBytes(goal)).toBeGreaterThan(8_000);
    expect(goal).toContain('(12 more interactive elements not listed)');
    // Past the declared count they are counted, never cut.
    expect(goal).toContain('(3 older objection(s) not listed)');
    expect(goal.match(/^- step \d+ · /gm)).toHaveLength(OBJECTIONS_BOUND.target);
    // The closed units are listed by label and outcome, the older ones counted,
    // and the counts line says which outcomes spend none of the budget.
    expect(goal).toContain('- Closed this session, oldest first:');
    expect(goal.match(/^ {2}- "l+\d\d" — done$/gm)).toHaveLength(CLOSED_TASKS_BOUND.target);
    expect(goal).toContain('  (3 older not listed)');
    expect(goal).toContain(
      '- done 1 · already-done 0 · skipped 0 · failed 0 · may still start 8 (a unit closed already-done or skipped spends none)',
    );
  });

  it('[QL-39] tells the planner no unit is open, that an item passed over needs none, and that nothing has closed yet', () => {
    const goal = goalOf(listingObservation(), [], emptyLedger());
    expect(goal).toContain(
      '- No unit of work is open: taskStart opens one when the procedure takes an item up; an item the mission says to pass over gets no taskStart.',
    );
    expect(goal).toContain('- Closed this session: none yet.');
    expect(goal).toContain('- done 0 · already-done 0 · skipped 0 · failed 0');
    expect(goal).not.toContain('may still start');
  });

  it('[QL-39] refuses a page that would not fit rather than clipping it', () => {
    const observation = {
      ...listingObservation(),
      elements: Array.from({ length: ELEMENTS_BOUND.target }, (_, i) => ({
        ...listingObservation().elements[0],
        ref: `e${i + 1}`,
        options: Array.from({ length: 60 }, () => 'o'.repeat(200)),
      })),
    };
    expect(() => goalOf(observation)).toThrow(GoalBudgetExceeded);
  });

  it('[QL-39] lists what a person can reach — inside the open dialog, visible — and counts the rest, every ref staying in the index', () => {
    // Measured 2026-10-07: an application dialog's five fields reached the
    // model among 150 lines, 67 of them hidden, with nothing saying a dialog
    // was open and the page behind it listed as if a person could reach it.
    const goal = goalOf(dialogObservation());
    const elements = between(goal, '## Elements', '## Snapshot');
    expect(elements).toContain(
      'Inside the open dialog "Apply to Acme" — the rest of the page waits behind it:',
    );
    expect(elements).toMatch(/^- e11 · textbox · "First name"/m);
    expect(elements).toMatch(/^- e13 · button · "Next"/m);
    // The listing's own links are behind the dialog: counted, not listed.
    expect(elements).not.toMatch(/^- e3 · /m);
    expect(elements).toContain(
      '(6 interactive elements not visible, hidden by the page or behind the open dialog are not listed; their refs are in the index and are never touched)',
    );
    // Every ref is still in the index, whether listed or not — marked behind the dialog where it is.
    const index = readStepIndex(goal);
    expect(index?.elements.map((e) => e.ref)).toEqual(
      dialogObservation().elements.map((e) => e.ref),
    );
    expect(index?.elements.filter((e) => e.behind).map((e) => e.ref)).toEqual(
      listingObservation().elements.map((e) => e.ref),
    );
    expect(index?.elements.find((e) => e.ref === 'e13')?.behind).toBe(false);

    // No dialog open: everything visible is listed, and only the hidden is counted.
    const form = goalOf(formObservation());
    expect(form).not.toContain('Inside the open');
    expect(form).toMatch(/^- e1 · textbox/m);
    expect(form).not.toMatch(/^- e3 · /m);
    expect(form).toContain('(1 interactive elements not visible');
    expect(readStepIndex(form)?.elements.find((e) => e.ref === 'e3')).toMatchObject({
      visible: false,
      behind: false,
    });

    // A page with nothing on it still says so.
    expect(goalOf({ ...listingObservation(), elements: [] })).toContain(
      '(no interactive elements)',
    );
    // A page with no element but a snapshot at a rung above none still shows something.
    expect(readStepIndex(goalOf({ ...listingObservation(), elements: [] }))?.pageShowsContent).toBe(
      true,
    );
  });

  it('[QL-39] says where the mission stands from engine facts: settled criteria with their statements, those done in the unit by id, the rest by id in rubric order', () => {
    const criteria = [
      { id: 'c1', kind: 'grounding', statement: 'The assessment names the kind of page.' },
      { id: 'c2', kind: 'progress', statement: 'Open the jobs search and run the search.' },
      { id: 'c3', kind: 'progress', statement: 'Open the next result.' },
      { id: 'c4', kind: 'progress', statement: 'Press the apply button.' },
      { id: 'c5', kind: 'safety', statement: 'Never sign in.' },
      { id: 'c6', kind: 'progress', statement: 'Submit on the review page.' },
    ];
    const goal = composeStepGoal({
      mission: MISSION_FIXTURE,
      observation: listingObservation(),
      history: [],
      ledger: openTaskLedger(),
      objections: [],
      progress: { criteria, settled: ['c2'], done: ['c3'] },
      pageUnchanged: false,
    });
    const section = between(goal, '## Progress', '## Limits');
    expect(section).toContain('- Satisfied earlier this session, not graded on this page:');
    expect(section).toContain('  - c2 — Open the jobs search and run the search.');
    expect(section).toContain('- Done in the open unit of work so far: c3.');
    // Open ones by id only — the rubric carries their statements — and never a never-do line.
    expect(section).toContain('- Still open: c4, c6.');
    expect(section).not.toContain('c5');
    expect(section).not.toContain('Press the apply button');
    // Nothing settled yet reads as such, not as an empty list.
    expect(goalOf(listingObservation())).toContain('- Satisfied earlier this session: none yet.');
  });

  it('[QL-39] lists a long select to the shown count in the goal and the index, counting the rest, and says when the page is unchanged', () => {
    const options = Array.from({ length: OPTIONS_SHOWN + 7 }, (_, i) => `Country ${i + 1}`);
    const observation = {
      ...formObservation(),
      elements: formObservation().elements.map((element) =>
        element.ref === 'e2' ? { ...element, options, optionsOmitted: 200 } : element,
      ),
    };
    const goal = goalOf(observation);
    expect(goal).toContain(`Country ${OPTIONS_SHOWN} (207 more the page offers)`);
    expect(goal).not.toContain(`Country ${OPTIONS_SHOWN + 1}`);
    const indexed = readStepIndex(goal)?.elements.find((element) => element.ref === 'e2');
    expect(indexed?.options).toHaveLength(OPTIONS_SHOWN);
    expect(indexed?.optionsOmitted).toBe(207);
    expect(readStepIndex(goalOf(formObservation()))?.elements[1].optionsOmitted).toBe(0);
    // The page section says when nothing moved, and only then.
    expect(goalOf(formObservation())).not.toContain('Unchanged since the last plan');
    expect(
      composeStepGoal({
        mission: MISSION_FIXTURE,
        observation: formObservation(),
        history: [],
        ledger: emptyLedger(),
        objections: [],
        progress: NO_PROGRESS,
        pageUnchanged: true,
        lastRan: [],
      }),
    ).toContain('Unchanged since the last plan: the recent actions moved nothing on this page.');
  });

  it('prints only the facts that are true of an element', () => {
    const line = renderElementLine({
      ...listingObservation().elements[0],
      value: null,
      options: ['a', 'b'],
      required: true,
      hiddenTraits: ['offscreen'],
    });
    expect(line).toBe(
      '- e1 · searchbox · "Search by title" · options: a | b · required · hidden: offscreen',
    );
    expect(renderElementLine(listingObservation().elements[1])).toBe('- e2 · button · "Search"');
    // A select past the shown count says how many more the page offers, and the page's invalid mark is printed.
    const shown = Array.from({ length: OPTIONS_SHOWN }, (_, i) => `o${i + 1}`);
    expect(
      renderElementLine({
        ...listingObservation().elements[0],
        value: null,
        options: [...shown, 'o61', 'o62'],
        optionsOmitted: 3,
        required: false,
        invalid: true,
        hiddenTraits: [],
      }),
    ).toBe(
      `- e1 · searchbox · "Search by title" · options: ${shown.join(' | ')} (5 more the page offers) · marked invalid by the page`,
    );
    // What a person reads on an element the tree gave no name, beside whatever stood in for one.
    expect(
      renderElementLine({
        ...listingObservation().elements[2],
        name: '',
        text: 'Senior Engineer Acme',
      }),
    ).toBe('- e3 · link · "" · text "Senior Engineer Acme"');
    expect(
      renderElementLine({ ...listingObservation().elements[2], name: 'search', text: 'Describe' }),
    ).toBe('- e3 · link · "search" · text "Describe"');
    // An element the tree named carries no text, so none is printed.
    expect(renderElementLine({ ...listingObservation().elements[2], text: null })).toBe(
      '- e3 · link · "Senior Engineer — Acme"',
    );
  });
});

describe('stepPlanSchema', () => {
  it('[QL-36] is a closed vocabulary of actions, the same one the records use, with no number a model writes', () => {
    const kinds = stepActionSchema.options.map((option) => option.shape.kind.value);
    expect([...kinds].sort()).toEqual([...STEP_ACTION_KINDS].sort());
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
  });

  it('[QL-36] a recent action that did not run leads with that fact, so a refused terminate never reads as a stop the session was given', () => {
    // Measured 2026-10-07: refused plans wrote their actions into the history
    // as "terminate limit-reached — the daily limit is reached — not-executed",
    // and the next producer read the limit as reached.
    const goal = goalOf(listingObservation(), [
      { action: 'click e3 link "Senior Engineer — Acme"', outcome: 'ok', note: 'the detail page' },
      {
        action: 'plan of 2 action(s): terminate, done',
        outcome: 'not-executed',
        note: null,
      },
      {
        action: 'terminate limit-reached — tried again later',
        outcome: 'not-executed',
        note: 'cut',
      },
    ]);
    const recent = between(goal, '## Recent actions', '## Objections');
    expect(recent).toContain('- click e3 link "Senior Engineer — Acme" — ok — the detail page');
    expect(recent).toContain(
      '- not-executed (proposed, did not run): plan of 2 action(s): terminate, done',
    );
    expect(recent).toContain(
      '- not-executed (proposed, did not run): terminate limit-reached — tried again later — cut',
    );
    // Never the action first when it did not happen.
    expect(recent).not.toMatch(/^- terminate limit-reached/m);
  });

  it('[BRW-8] renders a mark the mission declares beside every element that carries it, writes it into the index, and says the rule in the Limits', () => {
    // Measured 2026-10-07: a card name of 200 characters buried the one word
    // that said the listing was applied to; told in prose, the planner read
    // the words around it and clicked the card fifteen times.
    const marked = `${MISSION_FIXTURE}\n\n## Marks\n\n- "Globex": not this one.\n- "Acme": the house account.\n`;
    const goal = composeStepGoal({
      mission: marked,
      observation: listingObservation(),
      history: [],
      ledger: emptyLedger(),
      objections: [],
      progress: { criteria: [], settled: [], done: [] },
      pageUnchanged: false,
    });
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
      composeStepGoal({
        mission: `${MISSION_FIXTURE}\n\n## Marks\n\n- Globex without quotes\n`,
        observation: listingObservation(),
        history: [],
        ledger: emptyLedger(),
        objections: [],
        progress: { criteria: [], settled: [], done: [] },
        pageUnchanged: false,
      }),
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
      lastRan: ran,
    });
    const unchanged = composeStepGoal(input(true));
    expect(unchanged).toContain(
      'Ran on it at the last step and moved nothing: click link "Senior Engineer — Acme"; press "Enter"; click button "Gone from this page" — repeating any of these is cut.',
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
    expect(moved).not.toContain('Ran on it at the last step');
    expect(readStepIndex(moved)).toMatchObject({ pageUnchanged: false, lastRan: [] });
  });

  it('[QL-36] carries every rule the validators enforce as a description the model reads', () => {
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    for (const rule of [
      'exactly as the Elements list gives it',
      'A terminate or done action is last and appears nowhere else; a taskStart or taskDone comes before any action that could change the page.',
      'One of the options the Elements list gives for this ref, verbatim.',
    ]) {
      expect(json, `the model is never told: ${rule}`).toContain(rule);
    }
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

  it('[QL-39] tells a reader what it could not read, apart from what it left past its cap, so "nothing listed" and "more than are listed" can never describe one page', () => {
    const observation = {
      ...listingObservation(),
      elements: [],
      omittedElements: 0,
      unread: { elements: 135, snapshotLines: 450 },
      ariaSnapshot: '',
    };
    const goal = goalOf(observation);
    // The live contradiction this pins: read as one count, an unreadable page
    // rendered as "(no interactive elements)" directly above "(135 more
    // interactive elements not listed)", and the producer reasoned from it
    // that the page was populated — then was faulted for the misreading.
    expect(goal).toContain('(no interactive elements)');
    expect(goal).not.toContain('more interactive elements not listed');
    expect(goal).toContain('135 interactive elements were seen and could not be read');
    expect(goal).toContain("the page's own snapshot could not be read: 450 lines");

    // Past the cap is the other fact, and says the opposite: you have what matters.
    const capped = goalOf({ ...listingObservation(), omittedElements: 12, unread: null });
    expect(capped).toContain('(12 more interactive elements not listed)');
    expect(capped).not.toContain('could not be read');
  });
});
