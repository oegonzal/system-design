import type { InspectorAction } from './action';
import type { InspectorState } from './state';

/**
 * One action applied to the loop's working memory.
 *
 * Pure, total over the action union, and never mutating: every case returns a
 * new state that shares everything the action did not touch, which is what
 * makes a per-entry snapshot cheap enough to keep one for every action in the
 * log.
 *
 * Two rules the whole feature rests on:
 *
 * - **Beginning an iteration clears nothing.** The next ledger lands at the
 *   same path as the last, so a criterion that moved from fail to pass is one
 *   updated row rather than a removal and an unrelated addition.
 * - **A lens cell is keyed by its lens and sample, and carries the iteration
 *   that wrote it.** The second iteration's `critic.grounding#s1` overwrites
 *   the first's, which is the comparison worth reading; a lens that did not
 *   report again keeps its old cell, visibly stamped with the older iteration
 *   rather than passed off as current.
 */
export function reduce(state: InspectorState, action: InspectorAction): InspectorState {
  switch (action.type) {
    case 'run/opened':
      return { ...state, run: action.run };

    case 'contract/derived':
    case 'contract/provided':
    case 'contract/adopted':
      return { ...state, contract: action.contract };

    case 'iteration/began':
      return {
        ...state,
        iteration: { number: action.iteration, mode: action.mode, durationMs: null },
      };

    case 'artifact/produced':
    case 'artifact/provided':
    case 'artifact/adopted':
      return { ...state, artifact: action.artifact };

    case 'artifact/absent':
      // Validation goes with it. Validators run ON an artifact, so an iteration
      // with none recorded no reports — and leaving the last iteration's standing
      // showed its problems as though this iteration had just found them.
      return { ...state, artifact: null, validation: [] };

    case 'validation/ran':
      return { ...state, validation: action.reports };

    case 'critic/reported':
      return {
        ...state,
        lenses: {
          ...state.lenses,
          critics: { ...state.lenses.critics, [action.cellKey]: action.cell },
        },
      };

    case 'evaluator/reported':
      return {
        ...state,
        lenses: {
          ...state.lenses,
          evaluators: { ...state.lenses.evaluators, [action.cellKey]: action.cell },
        },
      };

    case 'ledger/normalised':
      return { ...state, ledger: action.ledger };

    case 'decision/decided':
      return { ...state, decision: action.decision, remediations: action.remediations };

    case 'iteration/ended':
      return {
        ...state,
        iteration:
          state.iteration === null
            ? { number: action.iteration, mode: 'initial', durationMs: action.durationMs }
            : { ...state.iteration, durationMs: action.durationMs },
      };

    case 'run/standing':
      return { ...state, standing: action.standing };

    case 'run/failed':
      return { ...state, failure: action.error };

    case 'exchange/recorded':
      return { ...state, exchanges: [...state.exchanges, action.exchange] };

    case 'orchestration/opened':
      return { ...state, orchestration: action.orchestration };

    case 'step/started':
    case 'step/completed':
    case 'step/skipped':
    case 'step/failed': {
      const orchestration = state.orchestration;
      if (orchestration === null) return state;
      // A step row says nothing about its children; the children it has already
      // opened are kept, because `step/opened-run` is what records those.
      const held = orchestration.steps[action.step.stepId];
      return {
        ...state,
        orchestration: {
          ...orchestration,
          steps: {
            ...orchestration.steps,
            [action.step.stepId]: { ...action.step, runIds: held?.runIds ?? [] },
          },
        },
      };
    }

    case 'step/opened-run': {
      const orchestration = state.orchestration;
      const step = orchestration?.steps[action.stepId];
      if (orchestration === null || orchestration === undefined || step === undefined) return state;
      if (step.runIds.includes(action.runId)) return state;
      return {
        ...state,
        orchestration: {
          ...orchestration,
          steps: {
            ...orchestration.steps,
            [action.stepId]: { ...step, runIds: [...step.runIds, action.runId] },
          },
        },
      };
    }

    case 'orchestration/finished':
      return state.orchestration === null
        ? state
        : {
            ...state,
            orchestration: {
              ...state.orchestration,
              status: action.status,
              finishedAt: action.finishedAt,
              error: action.error,
            },
          };
  }
}

/** Every action in order, from one starting state. */
export const reduceAll = (
  state: InspectorState,
  actions: readonly InspectorAction[],
): InspectorState => actions.reduce(reduce, state);
