import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GOAL_BUDGET_BYTES, GoalBudgetExceeded, textBytes } from '../quality-loop/goal-index';
import { emptyLedger, listingObservation, MISSION_FIXTURE, openTaskLedger } from './fixtures';
import type { ObservedElement, PageObservation } from './observation.schema';
import {
  ELEMENTS_BOUND,
  OBJECTION_AT_BOUND,
  OBJECTION_DETAIL_BOUND,
  OBJECTIONS_BOUND,
  pageObservationSchema,
  type StepObjection,
} from './observation.schema';
import { composeStepGoal, readStepIndex, renderElementLine } from './step-goal';
import { ACTIONS_BOUND, stepActionSchema, stepPlanSchema } from './step-plan.schema';
import { STEP_ACTION_KINDS } from './vocab';

const goalOf = (
  observation: PageObservation,
  history = [],
  ledger = emptyLedger(),
  objections: readonly StepObjection[] = [],
) => composeStepGoal({ mission: MISSION_FIXTURE, observation, history, ledger, objections });

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
    expect(index?.openTask).toBe(true);
    expect(index?.elements.map((e) => e.ref)).toEqual(observation.elements.map((e) => e.ref));
    expect(index?.elements.find((e) => e.ref === 'e6')?.disabled).toBe(true);
    expect(index?.elements.find((e) => e.ref === 'e1')?.kind).toBe('fillable');
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
   * snapshot and the mission at their caps. Options are listed twice — for
   * the model and in the index — so a page of long selects is the one shape
   * that does not fit; the session degrades such a page before composing.
   */
  it('[QL-39] renders a plausible maximal page under the engine budget', () => {
    const elements: ObservedElement[] = Array.from({ length: ELEMENTS_BOUND.target }, (_, i) => ({
      ref: `e${i + 1}`,
      role: i % 10 === 0 ? 'combobox' : 'link',
      name: 'x'.repeat(60),
      kind: i % 10 === 0 ? 'selectable' : 'clickable',
      inputType: null,
      value: null,
      options: i % 10 === 0 ? Array.from({ length: 6 }, (__, j) => `option number ${j}`) : null,
      required: i % 10 === 0,
      disabled: false,
      visible: true,
      maxLength: null,
      hiddenTraits: [],
      context: i % 5 === 0 ? 'c'.repeat(80) : null,
    }));
    const observation = pageObservationSchema.parse({
      ...listingObservation(),
      elements,
      omittedElements: 12,
      ariaSnapshot: 's'.repeat(16_000),
    });
    const goal = composeStepGoal({
      mission: 'm'.repeat(6_000),
      observation,
      history: Array.from({ length: 10 }, (_, i) => ({
        action: `click e${i} "${'n'.repeat(100)}"`,
        outcome: 'ok' as const,
        note: 'o'.repeat(200),
      })),
      ledger: openTaskLedger(),
      // Every objection the goal will carry, each at its ceiling, plus more
      // than it carries — the budget has to hold the worst case, not the mean.
      objections: Array.from({ length: OBJECTIONS_BOUND.target + 3 }, (_, i) =>
        maximalObjection(i + 1),
      ),
    });
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(goal).toContain('(12 more interactive elements not listed)');
    // Past the declared count they are counted, never cut.
    expect(goal).toContain('(3 older objection(s) not listed)');
    expect(goal.match(/^- step \d+ · /gm)).toHaveLength(OBJECTIONS_BOUND.target);
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
  });
});

describe('stepPlanSchema', () => {
  it('[QL-36] is a closed vocabulary of actions, the same one the records use, with no number a model writes', () => {
    const kinds = stepActionSchema.options.map((option) => option.shape.kind.value);
    expect([...kinds].sort()).toEqual([...STEP_ACTION_KINDS].sort());
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
  });

  it('[QL-36] carries every rule the validators enforce as a description the model reads', () => {
    const json = JSON.stringify(z.toJSONSchema(stepPlanSchema));
    for (const rule of [
      'exactly as the Elements list gives it',
      'A taskDone, terminate or done action is last and appears nowhere else.',
      'One of the options the Elements list gives for this ref, verbatim.',
    ]) {
      expect(json, `the model is never told: ${rule}`).toContain(rule);
    }
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
