import {
  ADMISSIONS as CONTRACT_ADMISSIONS,
  composeStepGoal,
  formObservation,
  GOAL_BUDGET_BYTES,
  GOAL_INDEX_FENCE_OPEN,
  GOAL_INDEX_HEADING,
  GoalBudgetExceeded,
  ELEMENTS_BOUND,
  MISSION_FIXTURE,
  openTaskLedger,
  renderDocumentGoal,
  resumeChunk,
  textBytes,
  type ObservedElement,
  type PageObservation,
  stepGoalInput,
  stopsOf,
  stopsOnPage,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { ADMISSIONS } from '../../core/outputs';
import { goalSection } from '../../core/stages/prompting';
import { fill } from '../../core/testing';
import { readIndex } from './input';

/** A page at the adapter's cap: every element listed, names and context as long as a form writes them, the snapshot full. */
function maximalObservation(): PageObservation {
  const element = (position: number): ObservedElement => {
    const selectable = position % 3 === 0;
    return {
      ref: `e${position + 1}`,
      role: selectable ? 'combobox' : 'textbox',
      name: fill(40, 'n'),
      text: null,
      kind: selectable ? 'selectable' : 'fillable',
      inputType: selectable ? null : 'text',
      value: null,
      options: selectable ? ['option one', 'option two', 'option three', 'option four'] : null,
      optionsOmitted: 0,
      required: true,
      invalid: false,
      disabled: false,
      visible: true,
      maxLength: null,
      hiddenTraits: [],
      context: fill(40, 'c'),
      scope: null,
      landmark: null,
    };
  };
  return {
    url: `https://jobs.example.test/${fill(200, 'u')}`,
    title: fill(100, 't'),
    elements: Array.from({ length: ELEMENTS_BOUND.target }, (_, position) => element(position)),
    omittedElements: 12,
    unread: null,
    activeScope: null,
    snapshotRung: 'full',
    reading: { reads: 1, settled: true, durationMs: 0 },
    // The snapshot an observation may carry is the whole goal budget; it is the
    // session's composer that fits it to the room every other cap leaves, and
    // that room is what this page measures.
    ariaSnapshot: '',
  };
}

describe('the browser-step input codec', () => {
  it('[QL-39] a composed goal round-trips: the index read back is the page the session wrote', () => {
    const observation = formObservation();
    const goal = composeStepGoal(
      stepGoalInput({
        observation,
        history: [{ action: 'click e6', outcome: 'ok', note: null }],
        ledger: openTaskLedger(),
      }),
    );
    expect(goal).toContain(MISSION_FIXTURE.trim());
    // A field the page hides is counted, not listed — and still in the index, so a plan that touches it is refused.
    expect(goal).not.toMatch(/^- e3 · /m);
    expect(goal).toContain(
      '(1 interactive elements not visible, hidden by the page or behind the open dialog are not listed and are never touched)',
    );
    expect(readIndex(goal)).toEqual({
      pipeline: 'browser-step',
      maxActions: 8,
      elements: observation.elements.map((element) => ({
        ref: element.ref,
        kind: element.kind,
        disabled: element.disabled,
        visible: element.visible,
        behind: false,
        options: element.options,
        optionsOmitted: 0,
        hiddenTraits: element.hiddenTraits,
        marks: [],
      })),
      pageShowsContent: true,
      pageUnchanged: false,
      lastRan: [],
      // The fixture mission ties one cause to words; the form page shows none of them.
      stops: [{ cause: 'limit-reached', token: 'no more applications', shown: false }],
      // Every cause the fixture mission declares, which a terminate must name.
      causes: ['limit-reached', 'login-wall', 'mission-complete'],
    });
  });

  it('[QL-39] a plain mission, another codec’s index or a broken fence reads as no index', () => {
    expect(readIndex(MISSION_FIXTURE)).toBeNull();
    expect(readIndex(renderDocumentGoal(resumeChunk()))).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
  });

  it('[QL-39] a model is shown the goal without its index, and the validators read the index from the goal as stored', () => {
    const goal = composeStepGoal(
      stepGoalInput({ observation: maximalObservation(), ledger: openTaskLedger() }),
    );
    const shown = goalSection(goal).text;
    expect(shown).not.toContain(GOAL_INDEX_HEADING);
    expect(shown).not.toContain(GOAL_INDEX_FENCE_OPEN);
    expect(shown).toContain('## Limits');
    // Measured 2026-10-08: the index was 12.5–13.5 KB of a 33 KB results-page goal.
    expect(textBytes(goal) - textBytes(shown)).toBeGreaterThan(3_000);
    expect(readIndex(goal)?.elements).toHaveLength(ELEMENTS_BOUND.target);
  });

  it('[QL-39] a page at every cap but the snapshot’s renders under the engine’s budget with room for one, and one past the budget is refused rather than clipped', () => {
    const observation = maximalObservation();
    const goal = composeStepGoal({
      mission: MISSION_FIXTURE,
      observation,
      history: Array.from({ length: 10 }, (_, index) => ({
        action: fill(200, String(index)),
        outcome: 'ok' as const,
        note: fill(300, 'x'),
      })),
      ledger: openTaskLedger(),
      objections: [],
      progress: { criteria: [], settled: [], done: [] },
      pageUnchanged: false,
      lastStep: null,
      stops: stopsOnPage(stopsOf(MISSION_FIXTURE), observation),
    });
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(GOAL_BUDGET_BYTES - textBytes(goal)).toBeGreaterThan(8_000);
    expect(readIndex(goal)?.elements).toHaveLength(ELEMENTS_BOUND.target);
    expect(goal).toContain('(12 more interactive elements not listed)');
    expect(() =>
      composeStepGoal(stepGoalInput({ observation, ledger: openTaskLedger() }), 1000),
    ).toThrow(GoalBudgetExceeded);
  });

  it('[QL-39] the admissions the composers read are pinned to the engine’s', () => {
    expect([...CONTRACT_ADMISSIONS]).toEqual([...ADMISSIONS]);
  });
});
