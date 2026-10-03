/**
 * The form-memory orchestrator's two steps, as adapters over its ports.
 * `recall` turns the page's own field labels into probes, searches the store
 * once and composes what came back into the goal every stage of the answerer
 * reads — a fact is evidence the answer must rest on, so the judges see it,
 * unlike a coach's lessons. `target` runs the field-answer pipeline over
 * that goal and reports the run's admission, so the caller never recomputes
 * it. Recall never blocks the target: a page with no evidence is still
 * answered, and its facts route to the operator.
 */
import {
  composeFieldGoal,
  FIELD_ANSWER_PIPELINE_ID,
  GoalBudgetExceeded,
  splitFieldGoal,
  type FieldSpec,
  type FormMemoryStepReason,
  type MemoryContextDto,
  type QualityRunDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { admission, outputsOf } from '../../core/outputs';
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

/**
 * The goal with as much of the evidence as fits the engine's budget, the
 * lowest-ranked items dropped first; null when not even one fits. Aliases
 * are positional, so a prefix keeps every alias the way it would have read.
 */
function composeWithinBudget(
  split: { prose: string; fields: readonly FieldSpec[] },
  hits: readonly MemoryHit[],
): { goal: string; evidence: number } | null {
  for (let count = hits.length; count > 0; count -= 1) {
    try {
      const goal = composeFieldGoal({
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
    ranked = await ctx.ports.store.searchMany(searchProbes(embedded.vectors));
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
 * Answer the fields over whatever recall handed on, with the rubric the
 * request carries; the run's admission rides on the step's report, so the
 * caller reads it there and never recomputes it.
 */
export async function target(ctx: Ctx): Promise<StepResult<QualityRunDto>> {
  const acceptAt = ctx.acceptAtOf(FIELD_ANSWER_PIPELINE_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', FIELD_ANSWER_PIPELINE_ID);
  const result = await runTarget(
    ctx,
    requestInput(ctx.request, ctx.outputs.recall?.goal ?? ctx.request.goal),
  );
  const trace = result.output?.trace ?? null;
  if (result.status !== 'complete' || trace === null) return result;
  return { ...result, report: { admission: admission(outputsOf(trace), acceptAt) } };
}
