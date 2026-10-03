import {
  ADMISSIONS as CONTRACT_ADMISSIONS,
  composeStepGoal,
  formObservation,
  GOAL_BUDGET_BYTES,
  GOAL_INDEX_FENCE_CLOSE,
  GOAL_INDEX_FENCE_OPEN,
  GoalBudgetExceeded,
  MAX_ELEMENTS,
  MISSION_FIXTURE,
  openTaskLedger,
  renderDocumentGoal,
  resumeChunk,
  SNAPSHOT_MAX_BYTES,
  textBytes,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { FENCE_CLOSE, FENCE_OPEN, GOAL_MAX_BYTES } from '../../core/contracts';
import { ADMISSIONS } from '../../core/outputs';
import { fill } from '../../core/testing';
import { readIndex } from './input';
import { stepGoal } from './testing';

/** A page at the adapter's cap: every element listed, names and context as long as a form writes them, the snapshot full. */
function maximalObservation(): PageObservation {
  const element = (position: number): ObservedElement => {
    const selectable = position % 3 === 0;
    return {
      ref: `e${position + 1}`,
      role: selectable ? 'combobox' : 'textbox',
      name: fill(40, 'n'),
      kind: selectable ? 'selectable' : 'fillable',
      inputType: selectable ? null : 'text',
      value: null,
      options: selectable ? ['option one', 'option two', 'option three', 'option four'] : null,
      required: true,
      disabled: false,
      visible: true,
      maxLength: null,
      hiddenTraits: [],
      context: fill(40, 'c'),
    };
  };
  return {
    url: `https://jobs.example.test/${fill(200, 'u')}`,
    title: fill(100, 't'),
    elements: Array.from({ length: MAX_ELEMENTS }, (_, position) => element(position)),
    omittedElements: 12,
    ariaSnapshot: fill(SNAPSHOT_MAX_BYTES, 's'),
  };
}

describe('the browser-step input codec', () => {
  it('[QL-39] a composed goal round-trips: the index read back is the page the session wrote', () => {
    const observation = formObservation();
    const goal = composeStepGoal({
      mission: MISSION_FIXTURE,
      observation,
      history: [{ action: 'click e6', outcome: 'ok', note: null }],
      ledger: openTaskLedger(),
    });
    expect(goal).toContain(MISSION_FIXTURE.trim());
    expect(goal).toContain(
      '- e3 · textbox · "Website" · type text · not visible · hidden: offscreen, autocomplete-off-bait',
    );
    expect(readIndex(goal)).toEqual({
      pipeline: 'browser-step',
      maxActions: 8,
      elements: observation.elements.map((element) => ({
        ref: element.ref,
        kind: element.kind,
        disabled: element.disabled,
        options: element.options,
        hiddenTraits: element.hiddenTraits,
      })),
      openTask: true,
    });
    expect(readIndex(stepGoal())?.openTask).toBe(false);
  });

  it('[QL-39] a plain mission, another codec’s index or a broken fence reads as no index', () => {
    expect(readIndex(MISSION_FIXTURE)).toBeNull();
    expect(readIndex(renderDocumentGoal(resumeChunk()))).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
  });

  it('[QL-39] a page at the adapter’s cap renders under the engine’s budget, and one past it is refused rather than clipped', () => {
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
    });
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(readIndex(goal)?.elements).toHaveLength(MAX_ELEMENTS);
    expect(goal).toContain('(12 more interactive elements not listed)');
    expect(() =>
      composeStepGoal(
        { mission: MISSION_FIXTURE, observation, history: [], ledger: openTaskLedger() },
        1000,
      ),
    ).toThrow(GoalBudgetExceeded);
  });

  it('[QL-39] the fence the composers write, the budget they refuse past and the admissions they read are pinned to the engine’s', () => {
    expect(GOAL_INDEX_FENCE_OPEN).toBe(FENCE_OPEN);
    expect(GOAL_INDEX_FENCE_CLOSE).toBe(FENCE_CLOSE);
    expect(GOAL_BUDGET_BYTES).toBe(GOAL_MAX_BYTES);
    expect([...CONTRACT_ADMISSIONS]).toEqual([...ADMISSIONS]);
  });
});
