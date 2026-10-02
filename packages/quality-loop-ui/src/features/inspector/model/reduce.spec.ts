import { describe, expect, it } from 'vitest';

import { makeTwoIterationRun, makeOrchestration, makeRun } from '../../../testing/fixtures';
import { deriveOrchestration } from './derive-orchestration';
import { deriveRun } from './derive-run';
import { reduce, reduceAll } from './reduce';
import { emptyState } from './state';

describe('the loop’s working memory', () => {
  it('[QLU-6] an iteration overwrites the last at the same path, so a transition is one change', () => {
    const run = makeTwoIterationRun();
    const actions = deriveRun(run);
    const afterFirst = reduceAll(
      emptyState(),
      actions.slice(
        0,
        actions.findIndex((action) => action.scope.iteration === 2),
      ),
    );
    const afterSecond = reduceAll(emptyState(), actions);

    // The same criterion, at the same path, with a different result — which is
    // the comparison the whole feature exists to show. A state keyed by
    // iteration would make this two unrelated additions instead.
    const c2 = (state: typeof afterFirst) =>
      state.ledger.criteria.find((entry) => entry.criterionId === 'c2')?.result;
    expect(c2(afterFirst)).toBe('fail');
    expect(c2(afterSecond)).toBe('pass');
    expect(afterFirst.ledger.findings).toHaveLength(2);
    expect(afterSecond.ledger.findings).toHaveLength(0);
  });

  it('[QLU-6] beginning an iteration clears nothing, and a lens cell says which iteration wrote it', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const began = actions.findIndex(
      (action) => action.type === 'iteration/began' && action.scope.iteration === 2,
    );
    const atBegan = reduceAll(emptyState(), actions.slice(0, began + 1));
    // The first iteration's evidence is still there: a reset would make every
    // per-iteration comparison a delete followed by an insert.
    expect(atBegan.ledger.findings).toHaveLength(2);
    expect(atBegan.decision?.finalDecision).toBe('revise');
    expect(atBegan.lenses.critics['critic.requirements#s1'].iteration).toBe(1);

    const settled = reduceAll(emptyState(), actions);
    // The second iteration's report lands at the same key, stamped with its own
    // iteration, so a lens that did not report again is visibly stale.
    expect(Object.keys(settled.lenses.critics)).toEqual(['critic.requirements#s1']);
    expect(settled.lenses.critics['critic.requirements#s1'].iteration).toBe(2);
  });

  it('[QLU-6] a step’s row and the children it opened are kept apart', () => {
    const actions = deriveOrchestration(makeOrchestration());
    const state = reduceAll(emptyState(), actions);
    expect(Object.keys(state.orchestration?.steps ?? {})).toEqual(['panel', 'reconcile']);
    expect(state.orchestration?.steps['panel'].runIds).toHaveLength(3);
    expect(state.orchestration?.steps['panel'].counts).toEqual({
      requested: 3,
      opened: 3,
      complete: 3,
      failed: 0,
    });

    // A later row for the same step keeps the children already recorded: a row
    // reports on the step itself and makes no claim about its children.
    const row = actions.find((action) => action.type === 'step/completed');
    const again = row === undefined ? state : reduce(state, row);
    expect(again.orchestration?.steps['panel'].runIds).toHaveLength(3);
  });

  it('[QLU-6] an action about something not open is ignored rather than inventing it', () => {
    // Nothing fabricates an orchestration from a step, or a step from a child.
    const steps = deriveOrchestration(makeOrchestration()).filter((action) =>
      action.type.startsWith('step/'),
    );
    expect(reduceAll(emptyState(), steps).orchestration).toBeNull();
  });

  it('[QLU-6] every action returns a new state and mutates nothing', () => {
    const before = emptyState();
    const snapshot = JSON.stringify(before);
    const after = reduceAll(before, deriveRun(makeRun()));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
  });
});
