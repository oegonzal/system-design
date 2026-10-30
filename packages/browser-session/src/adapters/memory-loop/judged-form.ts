import {
  composeFieldGoal,
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
  splitFieldGoal,
  textBytes,
  type EvidenceItem,
  type FieldGoalInput,
  type FormPipeline,
} from '@sysdesign/contracts';
import { awaitRun, type LoopClient } from '@sysdesign/loop-client';

import type { Decided, FieldsInput, FormReport, SessionStepRef } from '../../core/ports';
import {
  DECISION_ITERATIONS,
  guarded,
  openedBy,
  settled,
  type LoopBrainOptions,
} from '../loop-http/loop-runs';
import { composeFieldGoalWithinBudget } from '../loop-http/render-goal';

/**
 * A form page judged by the loop on a goal the session composed whole —
 * fields, unit of work and the evidence it recalled — as one run of the form
 * pipeline named, no orchestration between: the run is read back whole, and
 * its admission and what a reader withholds are read off its own readout,
 * which the loop computes once and the session recomputes nowhere.
 */

/** What a judged form reports beside the decision: everything a form report says but the recall, which the brain adds. */
type JudgedFields<T> = Decided<T> & Omit<FormReport, 'recall'>;

interface ComposedEvidenceGoal {
  goal: string;
  /** The statement ladder's rung, as `composeFieldGoalWithinBudget` reports it. */
  rung: string;
  bytes: number;
  /** How many of the items the goal lists: the best-ranked, as many as fit. */
  evidence: number;
}

/**
 * The goal fitted to the budget by two declared ladders in order: the unit's
 * statement first, cut as the form goal's own ladder cuts it with no evidence
 * in the goal; then the evidence fills the room that leaves, lowest-ranked
 * items dropped first. Aliases are positional, so a prefix keeps every alias
 * the way it would have read; the fitted goal is taken apart with the codec's
 * own inverse and composed again, so it still names its unit of work.
 */
function composeEvidenceGoal(
  pipeline: FormPipeline,
  input: FieldsInput,
  evidence: readonly EvidenceItem[],
  kinds: FieldGoalInput['kinds'],
  budget = GOAL_BUDGET_BYTES,
): ComposedEvidenceGoal {
  const ladder = composeFieldGoalWithinBudget(pipeline, input, budget);
  const split = splitFieldGoal(ladder.goal);
  if (split === null) throw new Error('the form goal composed does not read back as one');
  for (let count = evidence.length; count > 0; count -= 1) {
    try {
      const goal = composeFieldGoal(
        { ...split, kinds, evidence: evidence.slice(0, count) },
        budget,
      );
      return { goal, rung: ladder.rung, bytes: textBytes(goal), evidence: count };
    } catch (error) {
      if (!(error instanceof GoalBudgetExceeded)) throw error;
    }
  }
  return { goal: ladder.goal, rung: ladder.rung, bytes: ladder.bytes, evidence: 0 };
}

/**
 * One run of the form pipeline on the goal with the evidence, judged once,
 * awaited and read whole. A readout the loop did not answer — a run that
 * recorded no iteration, or whose pipeline the loop no longer registers —
 * admits nothing and withholds nothing.
 */
export function judgeFields<T>(
  loop: LoopClient,
  pipeline: FormPipeline,
  input: FieldsInput,
  evidence: readonly EvidenceItem[],
  kinds: FieldGoalInput['kinds'],
  session: SessionStepRef,
  what: string,
  options: LoopBrainOptions,
): Promise<JudgedFields<T>> {
  return guarded(async () => {
    const composed = composeEvidenceGoal(pipeline, input, evidence, kinds);
    const { runId } = await loop.startRun({
      pipeline,
      goal: composed.goal,
      criteria: [...input.criteria],
      maxIterations: DECISION_ITERATIONS,
      openedBy: openedBy(session, what),
    });
    const run = settled(await awaitRun(loop, runId, options));
    return {
      runId,
      orchestrationRunId: null,
      run,
      composition: { rung: composed.rung, bytes: composed.bytes, snapshotRung: null },
      admission: run.readout?.admission ?? 'fell-short',
      withheld: run.readout?.withheld ?? [],
    };
  });
}
