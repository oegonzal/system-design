/**
 * What more than one orchestrator declares: the pipelines a brief may never
 * be sent to, the request taken bare, the adapter that runs a pipeline as the
 * run's own deliverable, the stand-in a provided run makes, and the routes a
 * brief may be dispatched to. Each orchestrator names which of these it uses;
 * the runner applies none of them.
 */
import type {
  OrchestrationStepDto,
  PipelineSummary,
  QualityRunDto,
  RouteDto,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';

import { outputsOf } from '../core/outputs';
import type { RunInput } from '../core/run-pipeline';
import { bareGoal } from '../modules/memory/compose';
import { EXPERIENCE_DIGEST_ID } from '../pipelines/experience-digest/input';
import { MEMORY_RECALL_ID } from '../pipelines/memory-recall/input';
import type { StepContext, StepResult } from './definition';

/**
 * Pipelines that take a goal another step composed, never a brief. No
 * orchestrator accepts one as a target, and no router offers one as a route.
 */
export const INTERNAL_PIPELINES: readonly string[] = [MEMORY_RECALL_ID, EXPERIENCE_DIGEST_ID];

/** The `refuse` of every orchestrator that takes a target: an internal pipeline is not one. */
export const refuseInternal = (request: StartOrchestrationRequest): string | null =>
  request.pipeline !== undefined && INTERNAL_PIPELINES.includes(request.pipeline)
    ? `${request.pipeline} is a memory pipeline, not a target`
    : null;

/**
 * The `normalize` every orchestrator declares: a stored goal may carry what
 * a memory run appended, and no step should read that as part of the brief.
 */
export const bareRequest = (request: StartOrchestrationRequest): StartOrchestrationRequest => ({
  ...request,
  goal: bareGoal(request.goal),
});

/** The stand-in a step declares when a provided run is exactly its output. */
export const providedAsOutput = (run: QualityRunDto): StepResult<QualityRunDto> => ({
  status: 'skipped',
  reason: 'provided-run',
  runIds: [run.runId],
  output: run,
});

/**
 * Run one of the step's declared pipelines as the run's own deliverable: its
 * failure is the orchestration's, and its record is what later steps read.
 */
export async function runTarget<O extends object, P>(
  ctx: StepContext<O, P>,
  input: RunInput,
  pipeline?: string,
): Promise<StepResult<QualityRunDto>> {
  const child = await ctx.execute(input, pipeline);
  if (child.status === 'failed' || child.trace === null) {
    return {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message ?? null,
      error: child.error ?? {
        name: 'RunFailed',
        message: 'the target run produced no trace',
        stack: null,
      },
    };
  }
  const outputs = outputsOf(child.trace);
  return {
    status: 'complete',
    counts: {
      iterations: child.trace.iterations.length,
      overall: outputs.decision?.scores.overall ?? 0,
    },
    output: child,
  };
}

/** The registered pipelines a brief may be routed to, as a classifier should see them. */
export const briefRoutes = (registry: readonly PipelineSummary[]): RouteDto[] =>
  registry
    .filter((summary) => !INTERNAL_PIPELINES.includes(summary.id))
    .map((summary) => ({ id: summary.id, description: summary.description }));

/** The one child of a step that runs a pipeline once; null when it opened none. */
export const soleChild = (step: OrchestrationStepDto | undefined): string | null =>
  step?.runIds[0] ?? null;
