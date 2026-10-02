/**
 * What more than one orchestrator declares: the refusal of a composed-goal
 * pipeline as a target, the request taken bare, the adapter that runs a pipeline as the
 * run's own deliverable, the stand-in a provided run makes, and the routes a
 * brief may be dispatched to. Each orchestrator names which of these it uses;
 * the runner applies none of them.
 */
import type {
  PipelineSummary,
  QualityRunDto,
  RouteDto,
  RunTrace,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';

import { outputsOf } from '../core/outputs';
import type { RunInput } from '../core/loop/run-pipeline';
import { bareGoal } from './memory/recall/inject';
import type { StepContext, StepResult } from './runner/definition';

/**
 * The `refuse` of every orchestrator that takes a target: a pipeline that
 * declares a composed goal — a memory step's, the studio's — is not one. Read
 * from the registry's summaries, never from a list of ids kept here; an
 * unregistered id is the service's 404, which comes first.
 *
 * It says nothing when the target stands in. The reason is about composing a
 * goal for a run about to start, and a stood-in target never runs: a finished
 * run of a composed-goal pipeline is still a run the later steps can read.
 */
export const refuseInternal = (
  request: StartOrchestrationRequest,
  pipelines: readonly PipelineSummary[],
  stood = false,
): string | null => {
  const target =
    request.pipeline === undefined || stood
      ? undefined
      : pipelines.find((summary) => summary.id === request.pipeline);
  return target?.goalSource === 'composed'
    ? `${request.pipeline} is not a target: it takes a composed goal, not a brief`
    : null;
};

/**
 * The `normalize` every orchestrator declares: a stored goal may carry what
 * a memory run appended, and no step should read that as part of the brief.
 */
export const bareRequest = (request: StartOrchestrationRequest): StartOrchestrationRequest => ({
  ...request,
  goal: bareGoal(request.goal),
});

/** The run inputs a request carries, for a step that runs a pipeline on the request's own terms. */
export const requestInput = (
  request: StartOrchestrationRequest,
  goal: string = request.goal,
): RunInput => ({
  goal,
  output: request.output,
  maxIterations: request.maxIterations,
});

/** A skip yields nothing, so it satisfies every step's result type. */
export const skipped = (reason: string, note: string | null = null): StepResult<never> => ({
  status: 'skipped',
  reason,
  note,
});

/**
 * A child that completed with its trace settled; anything else — a failed
 * run, or a running one whose trace is only its progress so far — is a run
 * the step cannot read.
 */
export const completed = (child: QualityRunDto): child is QualityRunDto & { trace: RunTrace } =>
  child.status === 'complete' && child.trace !== null;

/** The step's failure when its child did not complete, in the child's own words. */
export const runFailed = (child: QualityRunDto): StepResult<never> => ({
  status: 'failed',
  reason: 'run-failed',
  note: child.error?.message ?? null,
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
  if (!completed(child)) {
    return {
      ...runFailed(child),
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
    .filter((summary) => summary.goalSource === 'brief')
    .map((summary) => ({ id: summary.id, description: summary.description }));
