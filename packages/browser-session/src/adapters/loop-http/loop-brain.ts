import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  BROWSER_STEP_PIPELINE_ID,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_TARGET_STEP,
  formTargetReportSchema,
  GoalBudgetExceeded,
  renderDocumentGoal,
  type AnswerSuggestions,
  type DocumentChunk,
  type FieldAnswers,
  type FormPipeline,
  type QualityRunDto,
  type RunOpenerDto,
  type StepPlan,
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
  type DerivedRubric,
  type FieldsInput,
  type FormReport,
  type SessionStepRef,
  type StepInput,
} from '../../core/ports';
import { composeFieldGoalWithinBudget, composeStepGoalWithinBudget } from './render-goal';

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

/** Who opens a run for the session: the session by its id, and what the run was to it — "step 6 · form page". */
const openedBy = (session: SessionStepRef, what: string | null): RunOpenerDto => ({
  kind: 'browser-session',
  id: session.sessionId,
  label: what === null ? `step ${session.step}` : `step ${session.step} · ${what}`,
});

export class LoopBrain implements BrainPort {
  constructor(
    private readonly client: LoopClient,
    private readonly options: LoopBrainOptions = {},
  ) {}

  deriveRubric(pipeline: string, goal: string): Promise<DerivedRubric> {
    return guarded(async () => {
      const { criteria, dumpRunId } = await this.client.deriveCriteria({ pipeline, goal });
      return { criteria, dumpRunId };
    });
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
        openedBy: openedBy(input.session, null),
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

  answerFields(input: FieldsInput): Promise<Decided<FieldAnswers> & FormReport> {
    return this.formRun(input, FIELD_ANSWER_PIPELINE_ID, 'form page');
  }

  suggestAnswers(input: FieldsInput): Promise<Decided<AnswerSuggestions> & FormReport> {
    return this.formRun(input, ANSWER_SUGGESTIONS_PIPELINE_ID, 'suggested answers');
  }

  /**
   * One form pipeline over the fields, through the form-memory orchestration:
   * the goal composed for the pipeline named — its index naming the open unit
   * of work, whose memories alone of those bound to a unit the recall reads —
   * the run it opened read back, and what the orchestration reported of it:
   * its admission, and the locations a reader withholds.
   */
  private formRun<T>(
    input: FieldsInput,
    pipeline: FormPipeline,
    what: string,
  ): Promise<Decided<T> & FormReport> {
    return guarded(async () => {
      const composed = composeFieldGoalWithinBudget(pipeline, input);
      const { orchestrationRunId } = await this.client.startOrchestration(
        FORM_MEMORY_ORCHESTRATOR_ID,
        {
          pipeline,
          goal: composed.goal,
          criteria: [...input.criteria],
          maxIterations: DECISION_ITERATIONS,
          openedBy: openedBy(input.session, what),
        },
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
      // The report read with the shape the orchestrator declares for it: one
      // missing, or one that does not read, is no admission and withholds nothing.
      const report = formTargetReportSchema.safeParse(target.report);
      return {
        runId,
        orchestrationRunId,
        run,
        composition: { rung: composed.rung, bytes: composed.bytes, snapshotRung: null },
        admission: report.success ? report.data.admission : 'fell-short',
        withheld: report.success ? report.data.withheld : [],
      };
    });
  }

  teach(document: DocumentChunk, session: SessionStepRef): Promise<{ orchestrationRunId: string }> {
    return guarded(async () => {
      const { orchestrationRunId } = await this.client.startOrchestration(
        DOCUMENT_MEMORY_ORCHESTRATOR_ID,
        {
          goal: renderDocumentGoal(document),
          maxIterations: TEACH_ITERATIONS,
          openedBy: openedBy(session, 'teaching'),
        },
      );
      return { orchestrationRunId };
    });
  }
}
