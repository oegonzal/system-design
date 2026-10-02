import { describe, expect, it } from 'vitest';

import { makeEscalatedRun, makeRun, makeTwoIterationRun } from '../../../testing/fixtures';
import { ACTION_GROUPS, groupOf, type ActionType, type InspectorAction } from './action';
import { deriveRun } from './derive-run';
import { reduceAll } from './reduce';
import { emptyState } from './state';

const types = (actions: readonly InspectorAction[]): ActionType[] =>
  actions.map((action) => action.type);

describe('reading a run out as actions', () => {
  it('[QLU-6] accounts for every stage of every iteration, in the engine’s declared order', () => {
    const actions = deriveRun(makeRun());
    expect(types(actions)).toEqual([
      'run/opened',
      'contract/derived',
      'iteration/began',
      'artifact/produced',
      'validation/ran',
      'critic/reported',
      'evaluator/reported',
      'ledger/normalised',
      'decision/decided',
      'iteration/ended',
      'run/standing',
      'exchange/recorded',
      'exchange/recorded',
      'exchange/recorded',
      'exchange/recorded',
    ]);
    // Declaration order, not arrival order: a wave's evidence is a function of
    // the order the pipeline declares its lenses in, never of which call
    // answered first, so that is the order worth reading.
    expect(actions.every((action) => action.scope.runId === makeRun().runId)).toBe(true);
    expect(new Set(actions.map((action) => action.key)).size).toBe(actions.length);
  });

  it('[QLU-6] labels every action by the scope it belongs to — run, then iteration', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const iterations = actions.map((action) => action.scope.iteration ?? null);
    // Run-scope actions carry no iteration; everything inside one does.
    expect(new Set(iterations)).toEqual(new Set([null, 1, 2]));
    const second = actions.filter((action) => action.scope.iteration === 2);
    expect(types(second)).toEqual([
      'iteration/began',
      'artifact/produced',
      'validation/ran',
      'critic/reported',
      'evaluator/reported',
      'ledger/normalised',
      'decision/decided',
      'iteration/ended',
    ]);
    expect(second[0].label).toBe('Iteration 2 began — revise');
  });

  it('[QLU-6] a child run carries the orchestration and step that opened it', () => {
    const actions = deriveRun(makeRun(), {
      scope: { orchestrationRunId: 'orch-1', stepId: 'panel' },
    });
    expect(
      actions.every(
        (action) => action.scope.orchestrationRunId === 'orch-1' && action.scope.stepId === 'panel',
      ),
    ).toBe(true);
  });

  it('[QLU-6] a run with no artifact says so rather than reporting an empty one', () => {
    const actions = deriveRun(makeEscalatedRun());
    expect(types(actions)).toEqual([
      'run/opened',
      'contract/derived',
      'iteration/began',
      'artifact/absent',
      // Emitted even though nothing validated: an empty list is a fact about
      // THIS iteration, and skipping the action left the previous iteration's
      // reports standing as though they were this one's.
      'validation/ran',
      'ledger/normalised',
      'decision/decided',
      'iteration/ended',
      'run/standing',
    ]);
    expect(actions.find((action) => action.type === 'validation/ran')?.label).toBe(
      'No validator ran',
    );
    const state = reduceAll(emptyState(), actions);
    expect(state.artifact).toBeNull();
    expect(state.ledger.diagnostics).toHaveLength(3);
    expect(state.standing?.stopReason).toBe('escalated');
  });

  it('[QLU-6] the standing is keyed by what it asserts, so a run still open re-asserts a new one', () => {
    const open = deriveRun(makeRun({ status: 'running', finishedAt: null, trace: null }));
    expect(types(open)).toEqual([
      'run/opened',
      'run/standing',
      'exchange/recorded',
      'exchange/recorded',
      'exchange/recorded',
      'exchange/recorded',
    ]);
    const standing = open.find((action) => action.type === 'run/standing');
    const settled = deriveRun(makeRun()).find((action) => action.type === 'run/standing');
    expect(standing?.key).not.toBe(settled?.key);
    expect(standing?.label).toBe('Standing: running');
    expect(settled?.label).toBe('Standing: revise (max-iterations)');
  });

  it('[QLU-6] a failure is its own action, and never invents a standing to hang itself on', () => {
    const failed = deriveRun(
      makeRun({
        status: 'failed',
        trace: null,
        error: { name: 'LlmUnavailable', message: 'no model', stack: null },
      }),
    );
    expect(types(failed).filter((type) => type.startsWith('run/'))).toEqual([
      'run/opened',
      'run/standing',
      'run/failed',
    ]);
    const state = reduceAll(emptyState(), failed);
    expect(state.failure?.name).toBe('LlmUnavailable');
    expect(state.standing).toMatchObject({ status: 'failed', bestIteration: null });
  });

  it('[QLU-6] every action type is declared in exactly one group', () => {
    const declared = Object.values(ACTION_GROUPS).flat();
    expect(new Set(declared).size).toBe(declared.length);
    // Every action the derivations can produce resolves to a group, so the
    // rail's filter is generated from the table rather than written out.
    const produced = new Set<ActionType>([
      ...types(deriveRun(makeTwoIterationRun())),
      ...types(deriveRun(makeEscalatedRun())),
    ]);
    for (const type of produced) expect(() => groupOf(type)).not.toThrow();
  });
});
