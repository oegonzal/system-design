import {
  BROWSER_STEP_PIPELINE_ID,
  composeFieldGoal,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  GoalBudgetExceeded,
  isAdmission,
  renderDocumentGoal,
  textBytes,
  type Admission,
  type DocumentChunk,
  type FieldAnswers,
  type QualityRunDto,
  type StepPlan,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import {
  awaitOrchestration,
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
  type BrainPort,
  type Decided,
  type FieldsInput,
  type StepInput,
} from '../../core/ports';
import { composeStepGoalWithinBudget, renderFieldProse } from './render-goal';

/**
 * The brain is the quality loop. A plan is a `browser-step` run started on
 * the composed goal and awaited; field answers are a `form-memory`
 * orchestration whose target run is read back with the admission the
 * server reports; teaching is a `document-memory` orchestration, opened and
 * left to run. The rubric comes from the caller on every request, so the
 * criteria ids mean the same thing across the session. Every error the
 * client raises becomes a `BrainFaulted` with its reason; anything else is a
 * bug and is rethrown.
 */

/** The form-memory orchestrator's step that runs the field-answer pipeline. */
export const FORM_MEMORY_TARGET_STEP = 'target';
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
export const DECISION_ITERATIONS_WHEN_NOTHING_RAN = 2;
/** A digest may revise once. */
export const TEACH_ITERATIONS = 2;

type ErrorClass = abstract new (...args: never[]) => Error;

/** The client's errors, each to the fault it is. */
const FAULT_BY_ERROR: readonly (readonly [ErrorClass, BrainFaultReason])[] = [
  [LoopUnreachable, 'unreachable'],
  [LoopTimeout, 'unreachable'],
  [LoopRunLost, 'lost'],
  [LoopRunStale, 'stale'],
  [LoopRefused, 'failed'],
  [DerivationFailed, 'failed'],
  [GoalBudgetExceeded, 'goal-budget'],
];

/** The fault an error is, or null for an error that is not the loop's. */
export function toBrainFault(error: unknown): BrainFaulted | null {
  if (error instanceof BrainFaulted) return error;
  const match = FAULT_BY_ERROR.find(([type]) => error instanceof type);
  return match === undefined ? null : new BrainFaulted(match[1], (error as Error).message);
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toBrainFault(error) ?? error;
  }
}

/** A run that failed decided nothing. */
const settled = (run: QualityRunDto): QualityRunDto => {
  if (run.status === 'failed') {
    throw new BrainFaulted('failed', run.error?.message ?? `run ${run.runId} failed`);
  }
  return run;
};

export type LoopBrainOptions = Pick<AwaitOptions, 'pollEveryMs' | 'staleAfterMs' | 'now' | 'sleep'>;

export class LoopBrain implements BrainPort {
  constructor(
    private readonly client: LoopClient,
    private readonly options: LoopBrainOptions = {},
  ) {}

  deriveRubric(pipeline: string, goal: string): Promise<SuccessCriterion[]> {
    return guarded(async () => (await this.client.deriveCriteria({ pipeline, goal })).criteria);
  }

  planStep(input: StepInput): Promise<Decided<StepPlan>> {
    return guarded(async () => {
      const composed = composeStepGoalWithinBudget({
        ...input,
        progress: { criteria: input.criteria, ...input.progress },
      });
      // A criterion the session settled is not graded again: the rubric this
      // run reads omits it, and the goal's Progress section carries it instead.
      const criteria = input.criteria.filter(
        (criterion) => !input.progress.settled.includes(criterion.id),
      );
      const { runId } = await this.client.startRun({
        pipeline: BROWSER_STEP_PIPELINE_ID,
        goal: composed.goal,
        criteria,
        maxIterations:
          input.pageUnchanged && input.lastStep?.ran === 0
            ? DECISION_ITERATIONS_WHEN_NOTHING_RAN
            : DECISION_ITERATIONS,
      });
      const run = settled(await awaitRun(this.client, runId, this.options));
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

  answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & { admission: Admission }> {
    return guarded(async () => {
      const goal = composeFieldGoal({
        prose: renderFieldProse(input),
        fields: input.fields,
        evidence: [],
      });
      const { orchestrationRunId } = await this.client.startOrchestration(
        FORM_MEMORY_ORCHESTRATOR_ID,
        { goal, criteria: [...input.criteria], maxIterations: DECISION_ITERATIONS },
      );
      const orchestration = await awaitOrchestration(this.client, orchestrationRunId, this.options);
      if (orchestration.status === 'failed') {
        throw new BrainFaulted(
          'failed',
          orchestration.error?.message ?? `orchestration ${orchestrationRunId} failed`,
        );
      }
      const target = orchestration.steps[FORM_MEMORY_TARGET_STEP];
      const runId = target?.runIds[0];
      if (target === undefined || runId === undefined) {
        throw new BrainFaulted(
          'no-artifact',
          `orchestration ${orchestrationRunId} opened no ${FORM_MEMORY_TARGET_STEP} run${
            target?.reason ? ` (${target.reason})` : ''
          }`,
        );
      }
      const fetched = await this.client.getRun(runId);
      if (fetched === null) throw new BrainFaulted('lost', `the loop no longer has run ${runId}`);
      const run = settled(fetched);
      const reported = target.report?.['admission'];
      return {
        runId,
        orchestrationRunId,
        run,
        composition: { rung: 'full', bytes: textBytes(goal), snapshotRung: null },
        admission: isAdmission(reported) ? reported : 'fell-short',
      };
    });
  }

  teach(document: DocumentChunk): Promise<{ orchestrationRunId: string }> {
    return guarded(async () => {
      const { orchestrationRunId } = await this.client.startOrchestration(
        DOCUMENT_MEMORY_ORCHESTRATOR_ID,
        { goal: renderDocumentGoal(document), maxIterations: TEACH_ITERATIONS },
      );
      return { orchestrationRunId };
    });
  }
}
