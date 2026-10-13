/**
 * The form-memory orchestrator's two steps, as adapters over its ports.
 * `recall` turns the page's own field labels into probes, searches the store
 * once and composes what came back into the goal every stage of the form
 * pipeline reads — a fact is evidence a value must rest on, so the judges see
 * it, unlike a coach's lessons. `target` runs the form pipeline the request
 * names over that goal and reports the run's admission and what a reader of
 * it withholds, each read off that pipeline's own definition, so the caller
 * never recomputes either. Recall never blocks the target: a page with no
 * evidence is still run, and its facts route to the operator.
 */
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  composeFieldGoal,
  FIELD_ANSWER_PIPELINE_ID,
  FORM_PIPELINES,
  GoalBudgetExceeded,
  parseLenient,
  splitFieldGoal,
  type FieldSpec,
  type FormMemoryStepReason,
  type FormPipeline,
  type MemoryContextDto,
  type QualityRunDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import {
  admission,
  outputsOf,
  withheldItems,
  withholdingOf,
  type RunOutputs,
  type WithheldItem,
} from '../../core/outputs';
import type { PipelineDefinition } from '../../core/pipeline';
import { ANSWER_SUGGESTIONS } from '../../pipelines/answer-suggestions/definition';
import { FIELD_ANSWER } from '../../pipelines/field-answer/definition';
import { requestInput, runTarget, skipped, storeReadiness } from '../common';
import type { MemoryHit } from '../memory/ports';
import type { StepContext, StepResult } from '../runner/definition';
import type { FormMemoryPorts } from './ports';
import { distinctHits, evidenceItems, fieldEvidence, fieldProbes, searchProbes } from './probes';

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
 * The locations of the run's best artifact a reader withholds, each with what
 * withheld it and why: every one a confirmed finding or a validator problem
 * names, as far as what named it withholds — read off the pipeline's own
 * declarations, over engine facts only. The session routes by these and
 * recomputes nothing from the findings itself.
 */
export function withheldOf<T>(
  definition: PipelineDefinition<T>,
  outputs: RunOutputs,
): WithheldItem[] {
  const { best } = outputs;
  if (best === null) return [];
  // Read as the session reads it: a text a little past its bound is kept and noted, never a reason to withhold nothing.
  const parsed = parseLenient(definition.task.output.schema, best.artifact);
  if (!parsed.ok) return [];
  const items = definition.task.output.locate(parsed.value).map((location) => location.id);
  return withheldItems(best.ledger, items, withholdingOf(definition));
}

/**
 * The goal with as much of the evidence as fits the engine's budget, the
 * lowest-ranked items dropped first; null when not even one fits. Aliases
 * are positional, so a prefix keeps every alias the way it would have read.
 */
function composeWithinBudget(
  split: { pipeline: FormPipeline; prose: string; fields: readonly FieldSpec[] },
  hits: readonly MemoryHit[],
): { goal: string; evidence: number } | null {
  for (let count = hits.length; count > 0; count -= 1) {
    try {
      const goal = composeFieldGoal({
        pipeline: split.pipeline,
        prose: split.prose,
        fields: split.fields,
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
  const probes = fieldProbes(split.fields);
  if (probes.texts.length === 0) return skip('no-fields');

  const embedded = await ctx.ports.embeddings.embed(probes.texts);
  const counted = { probes: probes.texts.length };
  if (embedded === null) return { status: 'failed', reason: 'embedding-failed', counts: counted };
  let ranked: MemoryHit[][];
  try {
    ranked = await ctx.ports.store.searchMany(searchProbes(embedded.vectors, probes.limits));
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
 * with the rubric the request carries; the run's admission and the locations
 * a reader of it withholds ride on the step's report, so the caller reads
 * them there and never recomputes them.
 */
export async function target(ctx: Ctx): Promise<StepResult<QualityRunDto>> {
  const pipeline = formPipelineOf(ctx.request.pipeline);
  if (pipeline === null) return skip('pipeline-unavailable', ctx.request.pipeline ?? null);
  const acceptAt = ctx.acceptAtOf(pipeline);
  if (acceptAt === null) return skip('pipeline-unavailable', pipeline);
  const result = await runTarget(
    ctx,
    requestInput(ctx.request, ctx.outputs.recall?.goal ?? ctx.request.goal),
    pipeline,
  );
  const trace = result.output?.trace ?? null;
  if (result.status !== 'complete' || trace === null) return result;
  const outputs = outputsOf(trace);
  return {
    ...result,
    report: {
      admission: admission(outputs, acceptAt),
      withheld: withheldOf(FORM_DEFINITIONS[pipeline], outputs),
    },
  };
}
