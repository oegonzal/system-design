import {
  ADMISSIONS as CONTRACT_ADMISSIONS,
  composeStepGoal,
  formObservation,
  GOAL_BUDGET_BYTES,
  GOAL_INDEX_FENCE_CLOSE,
  GOAL_INDEX_FENCE_OPEN,
  GoalBudgetExceeded,
  ELEMENTS_BOUND,
  MISSION_FIXTURE,
  openTaskLedger,
  renderDocumentGoal,
  resumeChunk,
  textBytes,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { FENCE_CLOSE, FENCE_OPEN, GOAL_MAX_BYTES } from '../../core/contracts';
import { ADMISSIONS } from '../../core/outputs';
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
    const goal = composeStepGoal({
      mission: MISSION_FIXTURE,
      observation,
      history: [{ action: 'click e6', outcome: 'ok', note: null }],
      ledger: openTaskLedger(),
      objections: [],
      progress: { criteria: [], settled: [], done: [] },
      pageUnchanged: false,
    });
    expect(goal).toContain(MISSION_FIXTURE.trim());
    // A field the page hides is counted, not listed — and still in the index, so a plan that touches it is refused.
    expect(goal).not.toMatch(/^- e3 · /m);
    expect(goal).toContain(
      '(1 interactive elements not visible, hidden by the page or behind the open dialog are not listed; their refs are in the index and are never touched)',
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
      })),
      pageShowsContent: true,
    });
  });

  it('[QL-39] a plain mission, another codec’s index or a broken fence reads as no index', () => {
    expect(readIndex(MISSION_FIXTURE)).toBeNull();
    expect(readIndex(renderDocumentGoal(resumeChunk()))).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
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
    });
    expect(textBytes(goal)).toBeLessThan(GOAL_BUDGET_BYTES);
    expect(GOAL_BUDGET_BYTES - textBytes(goal)).toBeGreaterThan(8_000);
    expect(readIndex(goal)?.elements).toHaveLength(ELEMENTS_BOUND.target);
    expect(goal).toContain('(12 more interactive elements not listed)');
    expect(() =>
      composeStepGoal(
        {
          mission: MISSION_FIXTURE,
          observation,
          history: [],
          ledger: openTaskLedger(),
          objections: [],
          progress: { criteria: [], settled: [], done: [] },
          pageUnchanged: false,
        },
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
