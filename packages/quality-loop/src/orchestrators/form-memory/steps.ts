/**
 * The form-memory orchestrator's two steps, as adapters over its ports.
 * `recall` turns the page's own field labels into probes, searches the store
 * once — of what was recorded for one unit of work, only for the unit the
 * goal's index names — and composes what came back into the goal every stage
 * of the form pipeline reads, under the legend of the document kinds: a fact
 * is evidence a value must rest on, so the judges see it, unlike a coach's
 * lessons. `target` runs the form pipeline the request names over that goal
 * and reports the run's readout — its admission at the bar it was held to, and
 * what a reader of it withholds — read once, the way the run's own read
 * answers it, so the caller never recomputes either. Recall never blocks the
 * target: a page with no evidence is still run, and its facts route to the
 * operator.
 */
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  composeFieldGoal,
  DOCUMENT_MEMORY_LEGEND,
  FIELD_ANSWER_PIPELINE_ID,
  fieldProbes,
  FORM_PIPELINES,
  GoalBudgetExceeded,
  splitFieldGoal,
  type FieldGoalInput,
  type FormMemoryStepReason,
  type FormPipeline,
  type MemoryContextDto,
  type QualityRunDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { readoutOf } from '../../core/outputs';
import type { PipelineDefinition } from '../../core/pipeline';
import { ANSWER_SUGGESTIONS } from '../../pipelines/answer-suggestions/definition';
import { FIELD_ANSWER } from '../../pipelines/field-answer/definition';
import { requestInput, runTarget, skipped, storeReadiness } from '../common';
import type { MemoryHit } from '../memory/ports';
import type { StepContext, StepResult } from '../runner/definition';
import type { FormMemoryPorts } from './ports';
import {
  distinctHits,
  evidenceItems,
  fieldEvidence,
  HITS_PER_FIELD_TYPE,
  searchProbes,
} from './probes';

/** What each step hands on: the goal with evidence in it, and the answerer's run. */
export interface FormMemoryOutputs {
  recall: { goal: string };
  target: QualityRunDto;
}

type Ctx = StepContext<FormMemoryOutputs, FormMemoryPorts>;

/** A skip for one of the orchestrator's declared reasons, or the runner's two that a step may give itself. */
const skip = (
  reason: FormMemoryStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => skipped(reason, note);

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/** The form pipelines this orchestrator runs, each read back the way its own definition declares. */
const FORM_DEFINITIONS: Readonly<Record<FormPipeline, PipelineDefinition<unknown>>> = {
  [FIELD_ANSWER_PIPELINE_ID]: FIELD_ANSWER as PipelineDefinition<unknown>,
  [ANSWER_SUGGESTIONS_PIPELINE_ID]: ANSWER_SUGGESTIONS as PipelineDefinition<unknown>,
};

const formPipelineOf = (named: string | undefined): FormPipeline | null =>
  FORM_PIPELINES.find((pipeline) => pipeline === named) ?? null;

/**
 * The goal with as much of the evidence as fits the engine's budget, the
 * lowest-ranked items dropped first; null when not even one fits. Aliases
 * are positional, so a prefix keeps every alias the way it would have read;
 * the split is composed whole, so the goal still names its unit of work.
 */
function composeWithinBudget(
  split: Omit<FieldGoalInput, 'evidence' | 'kinds'>,
  hits: readonly MemoryHit[],
): { goal: string; evidence: number } | null {
  for (let count = hits.length; count > 0; count -= 1) {
    try {
      const goal = composeFieldGoal({
        ...split,
        kinds: DOCUMENT_MEMORY_LEGEND,
        evidence: evidenceItems(hits.slice(0, count)),
      });
      return { goal, evidence: count };
    } catch (error) {
      if (!(error instanceof GoalBudgetExceeded)) throw error;
    }
  }
  return null;
}

/**
 * Recall facts for the page's fields without a model call, and yield the
 * goal the answerer should run with. Every way it can hand on nothing is a
 * closed reason, and none of them stops the target.
 */
export async function recall(ctx: Ctx): Promise<StepResult<{ goal: string }>> {
  const notReady = storeReadiness(ctx.ports, contextOf(ctx).store);
  if (notReady !== null) return skip(notReady.reason, notReady.note);
  const split = splitFieldGoal(ctx.request.goal);
  if (split === null || split.fields.length === 0) return skip('no-fields');
  const probes = fieldProbes(split.fields, HITS_PER_FIELD_TYPE);
  if (probes.texts.length === 0) return skip('no-fields');

  const embedded = await ctx.ports.embeddings.embed(probes.texts);
  const counted = { probes: probes.texts.length };
  if (embedded === null) return { status: 'failed', reason: 'embedding-failed', counts: counted };
  let ranked: MemoryHit[][];
  try {
    ranked = await ctx.ports.store.searchMany(
      searchProbes(embedded.vectors, probes.limits, split.unitKey),
    );
  } catch (error) {
    return {
      status: 'failed',
      reason: 'store-unavailable',
      note: describeError(error).message,
      counts: counted,
    };
  }
  const hits = fieldEvidence(probes, ranked);
  const counts = { ...counted, candidates: distinctHits(ranked), evidence: hits.length };
  if (hits.length === 0) return { status: 'skipped', reason: 'store-empty', counts };
  const composed = composeWithinBudget(split, hits);
  if (composed === null) {
    return {
      status: 'complete',
      note: "the goal is at the engine's budget; no evidence fits beside it",
      counts: { ...counts, evidence: 0 },
    };
  }
  return {
    status: 'complete',
    counts: { ...counts, evidence: composed.evidence },
    output: { goal: composed.goal },
  };
}

/**
 * Run the form pipeline the request names over whatever recall handed on,
 * with the rubric the request carries; the run's readout — its admission at
 * the bar it was held to, and the locations a reader of it withholds — rides
 * on the step's report, read the one way `GET /runs/:id` answers it, so the
 * caller reads it there and never recomputes it.
 */
export async function target(ctx: Ctx): Promise<StepResult<QualityRunDto>> {
  const pipeline = formPipelineOf(ctx.request.pipeline);
  if (pipeline === null) return skip('pipeline-unavailable', ctx.request.pipeline ?? null);
  if (ctx.acceptAtOf(pipeline) === null) return skip('pipeline-unavailable', pipeline);
  const result = await runTarget(
    ctx,
    requestInput(ctx.request, ctx.outputs.recall?.goal ?? ctx.request.goal),
    pipeline,
  );
  if (result.status !== 'complete' || result.output === undefined) return result;
  const report = readoutOf(FORM_DEFINITIONS[pipeline], result.output);
  return report === null ? result : { ...result, report };
}
