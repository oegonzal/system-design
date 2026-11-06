import {
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
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

/**
 * What a judged form reports beside the decision: everything a form report
 * says but the recall, which the brain adds — and how many of the items it was
 * given the goal lists, the best-ranked, as many as fit.
 */
type JudgedFields<T> = Decided<T> & Omit<FormReport, 'recall'> & { listed: number };

interface ComposedEvidenceGoal {
  goal: string;
  /** The statement ladder's rung, as `composeFieldGoalWithinBudget` reports it. */
  rung: string;
  bytes: number;
  /** How many of the items the goal lists: the best-ranked, as many as fit. */
  evidence: number;
}

/**
 * The goal fitted to the budget with the evidence first: the statement ladder
 * measured with every item the recall dealt, so the unit's statement is cut
 * to the room the fields and the evidence leave; only when the evidence does
 * not fit even beside no statement at all are the lowest-ranked items
 * dropped, and the ladder measured again. A question about the subject is
 * answered from the evidence, while one about the unit rests on the
 * statement too, and the statement, cut at a node boundary, keeps the
 * page's first words — on a layout that lists other items before the
 * unit's own description, the list. Aliases are positional, so a prefix
 * keeps every alias the way it would have read. Measured 2026-11-06: a
 * 29-field form with two long option lists, fitted the other way round, kept
 * a 12.8 KB job page whole and dropped 10 of the 24 items recalled — the
 * subject's email address and home city among them — and both were put to
 * the operator as facts no evidence states; the other 48 form pages then
 * recorded composed whole with every item, so the order changes that page
 * alone, whose statement opens with the unit's own description.
 */
function composeEvidenceGoal(
  pipeline: FormPipeline,
  input: FieldsInput,
  evidence: readonly EvidenceItem[],
  kinds: FieldGoalInput['kinds'],
  budget = GOAL_BUDGET_BYTES,
): ComposedEvidenceGoal {
  for (let count = evidence.length; count > 0; count -= 1) {
    try {
      const items = { evidence: evidence.slice(0, count), kinds };
      const { goal, rung, bytes } = composeFieldGoalWithinBudget(pipeline, input, budget, items);
      return { goal, rung, bytes, evidence: count };
    } catch (error) {
      if (!(error instanceof GoalBudgetExceeded)) throw error;
    }
  }
  const { goal, rung, bytes } = composeFieldGoalWithinBudget(pipeline, input, budget);
  return { goal, rung, bytes, evidence: 0 };
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
      listed: composed.evidence,
      admission: run.readout?.admission ?? 'fell-short',
      withheld: run.readout?.withheld ?? [],
    };
  });
}
