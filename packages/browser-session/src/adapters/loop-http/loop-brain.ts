import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_TARGET_STEP,
  formTargetReportSchema,
  guidanceDocuments,
  renderDocumentGoal,
  type AnswerSuggestions,
  type FieldAnswers,
  type FormPipeline,
  type OperatorGuidanceDto,
  type StepPlan,
} from '@sysdesign/contracts';
import { awaitOrchestration, type LoopClient } from '@sysdesign/loop-client';

import {
  BrainFaulted,
  type BrainPort,
  type Decided,
  type DerivedRubric,
  type FieldsInput,
  type FormReport,
  type SessionStepRef,
  type StepInput,
  type TeachReceipt,
} from '../../core/ports';
import {
  DECISION_ITERATIONS,
  deriveRubricWith,
  guarded,
  openedBy,
  planStepWith,
  settled,
  type LoopBrainOptions,
} from './loop-runs';
import { composeFieldGoalWithinBudget } from './render-goal';

/**
 * The brain is the quality loop alone. A plan is a `browser-step` run started
 * on the composed goal and awaited; field answers are a `form-memory`
 * orchestration whose target run is read back with the admission the server
 * reports, its recall the loop's own; teaching is a `document-memory`
 * orchestration, opened and left to run, so a receipt says `queued`. The
 * rubric comes from the caller on every request, so the criteria ids mean the
 * same thing across the session. Every error the client raises becomes a
 * `BrainFaulted` with its reason; anything else is a bug and is rethrown.
 * The loop is the brain's one store, reached on every request: there is
 * nothing to bind before the first row.
 */

/** A digest may revise once. */
const TEACH_ITERATIONS = 2;

export class LoopBrain implements BrainPort {
  constructor(
    private readonly client: LoopClient,
    private readonly options: LoopBrainOptions = {},
  ) {}

  async bind(): Promise<void> {
    // Nothing is bound ahead: the loop is asked on every request, and refuses there.
  }

  deriveRubric(pipeline: string, goal: string): Promise<DerivedRubric> {
    return deriveRubricWith(this.client, pipeline, goal);
  }

  planStep(input: StepInput): Promise<Decided<StepPlan>> {
    return planStepWith(this.client, this.options, input);
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
   * its admission, and the locations a reader withholds. The recall is the
   * orchestration's own step, read from its record, so the brain reports none.
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
        recall: null,
      };
    });
  }

  /**
   * The answers handed to the memory as the guidance documents they make —
   * one per unit of work they were given in, as the contracts batch them, so
   * one answer taught the moment it is given is one document — each a
   * `document-memory` orchestration opened and left to run. Each answer's
   * receipt names the orchestration its document went to, queued: what it
   * stores is the loop's to say, later.
   */
  teach(
    answers: readonly OperatorGuidanceDto[],
    session: SessionStepRef,
    subject: string,
  ): Promise<readonly TeachReceipt[]> {
    return guarded(async () => {
      const documents = guidanceDocuments(session.sessionId, subject, answers, (one) => one);
      if (documents.length === 0) throw new Error('a teach carries at least one answer');
      const queuedOn = new Map<OperatorGuidanceDto, string>();
      for (const { document, answers: batch } of documents) {
        const { orchestrationRunId } = await this.client.startOrchestration(
          DOCUMENT_MEMORY_ORCHESTRATOR_ID,
          {
            goal: renderDocumentGoal(document),
            maxIterations: TEACH_ITERATIONS,
            openedBy: openedBy(session, 'teaching'),
          },
        );
        for (const answer of batch) queuedOn.set(answer, orchestrationRunId);
      }
      return answers.map((answer) => ({
        ref: queuedOn.get(answer) ?? null,
        outcome: 'queued',
        fault: null,
      }));
    });
  }
}
