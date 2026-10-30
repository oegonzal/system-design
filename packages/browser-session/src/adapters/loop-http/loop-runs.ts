import {
  BROWSER_SESSION_PIPELINES,
  BROWSER_STEP_PIPELINE_ID,
  GoalBudgetExceeded,
  type BrowserSessionRole,
  type QualityRunDto,
  type RunOpenerDto,
  type StepPlan,
} from '@sysdesign/contracts';
import {
  awaitRun,
  DerivationFailed,
  LoopRefused,
  LoopRunLost,
  LoopRunStale,
  LoopTimeout,
  LoopUnreachable,
  type AwaitOptions,
  type LoopClient,
} from '@sysdesign/loop-client';

import {
  BrainFaulted,
  type BrainFaultReason,
  type Decided,
  type DerivedRubric,
  type SessionStepRef,
  type StepInput,
} from '../../core/ports';
import { composeStepGoalWithinBudget } from './render-goal';

/**
 * What every brain over the loop shares: how a rubric is derived and a plan
 * asked for, how a run that failed is read, who a run says opened it, and how
 * the client's errors become the brain's faults. The two brains — the loop
 * alone (`loop-brain.ts`) and the loop with a memory space
 * (`../memory-loop/`) — differ in where a form page's evidence comes from and
 * where an operator's answer is taught; everything here is the same for both,
 * so it is written once and neither copies it.
 */

/** One judged plan or answer set: a fresh observation beats a blind revise. */
export const DECISION_ITERATIONS = 1;
/**
 * On a page that has not changed since the last plan, after a plan that ran
 * nothing, there is no fresh observation to have and nothing the page can add:
 * the loop revises once from its own briefing — the prior plan with the
 * remediations at their positions — before the session is handed the verdict.
 * After a plan that ran something, a fresh plan is briefed by what ran:
 * measured 2026-10-07, 23 such revises cost 8.3 minutes and the four that
 * changed what ran chose worse.
 */
const DECISION_ITERATIONS_WHEN_NOTHING_RAN = 2;

type ErrorClass = abstract new (...args: never[]) => Error;

/**
 * Which error is which fault, declared as rows: a brain over the loop alone
 * reads the loop's rows; one that asks another host too adds that host's
 * errors to the table it hands `guarded`, and nothing is matched by message.
 */
export type FaultTable = readonly (readonly [ErrorClass, BrainFaultReason])[];

/** The loop client's errors, each to the fault it is. */
export const LOOP_FAULTS: FaultTable = [
  [LoopUnreachable, 'unreachable'],
  [LoopTimeout, 'unreachable'],
  [LoopRunLost, 'lost'],
  [LoopRunStale, 'stale'],
  [LoopRefused, 'failed'],
  [DerivationFailed, 'failed'],
  [GoalBudgetExceeded, 'goal-budget'],
];

/** The fault an error is by the table, or null for an error the table does not name — a bug, left to be rethrown. */
function toBrainFault(error: unknown, faults: FaultTable = LOOP_FAULTS): BrainFaulted | null {
  if (error instanceof BrainFaulted) return error;
  const match = faults.find(([type]) => error instanceof type);
  return match === undefined ? null : new BrainFaulted(match[1], (error as Error).message);
}

/** The work done, every error the table names raised as its fault; anything else goes on as the error it is. */
export async function guarded<T>(
  work: () => Promise<T>,
  faults: FaultTable = LOOP_FAULTS,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toBrainFault(error, faults) ?? error;
  }
}

/** A run that failed decided nothing. */
export const settled = <Run extends QualityRunDto>(run: Run): Run => {
  if (run.status === 'failed') {
    throw new BrainFaulted('failed', run.error?.message ?? `run ${run.runId} failed`);
  }
  return run;
};

export type LoopBrainOptions = Pick<AwaitOptions, 'pollEveryMs' | 'staleAfterMs' | 'now' | 'sleep'>;

/** Who opens a run for the session: the session by its id, and what the run was to it — "step 6 · form page". */
export const openedBy = (session: SessionStepRef, what: string | null): RunOpenerDto => ({
  kind: 'browser-session',
  id: session.sessionId,
  label: what === null ? `step ${session.step}` : `step ${session.step} · ${what}`,
});

/** The rubric for the pipeline that plays a role in the session, derived by the loop from the mission alone, with the loop's dump of the derivation. */
export function deriveRubricWith(
  client: LoopClient,
  role: BrowserSessionRole,
  goal: string,
): Promise<DerivedRubric> {
  const pipeline = BROWSER_SESSION_PIPELINES[role];
  return guarded(async () => {
    const { criteria, dumpRunId } = await client.deriveCriteria({ pipeline, goal });
    return { pipeline, criteria, dumpRunId };
  });
}

/**
 * One `browser-step` run on the composed goal, awaited and read back: the
 * rubric rides in with the request, less the criteria the session settled,
 * which the goal's Progress section carries instead so they are not graded
 * again; a page unchanged since a plan that ran nothing is asked to revise
 * once in-run.
 */
export function planStepWith(
  client: LoopClient,
  options: LoopBrainOptions,
  input: StepInput,
): Promise<Decided<StepPlan>> {
  return guarded(async () => {
    const composed = composeStepGoalWithinBudget({
      ...input,
      progress: { criteria: input.criteria, ...input.progress },
    });
    const criteria = input.criteria.filter(
      (criterion) => !input.progress.settled.includes(criterion.id),
    );
    const { runId } = await client.startRun({
      pipeline: BROWSER_STEP_PIPELINE_ID,
      goal: composed.goal,
      criteria,
      openedBy: openedBy(input.session, null),
      maxIterations:
        input.pageUnchanged && input.lastStep?.ran === 0
          ? DECISION_ITERATIONS_WHEN_NOTHING_RAN
          : DECISION_ITERATIONS,
    });
    const run = settled(await awaitRun(client, runId, options));
    return {
      runId,
      orchestrationRunId: null,
      run,
      composition: {
        rung: composed.rung,
        bytes: composed.bytes,
        snapshotRung: composed.snapshotRung,
      },
    };
  });
}
