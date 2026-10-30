import { BadRequestException } from '@nestjs/common';
import {
  sameRubric,
  type AdoptedIterationRef,
  type IterationTrace,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';

import { rubricProblems } from '../../core/loop/rubric';
import type { PipelineDefinition } from '../../core/pipeline';
import type { RunRepository } from '../../core/ports';

/**
 * What an adopting request starts from: the recorded iteration, and what the
 * run that recorded it had adopted in turn — the next link of the chain its
 * recall screens against.
 */
export interface Adoption {
  iteration: IterationTrace;
  adoptedFrom: AdoptedIterationRef | null;
}

/**
 * What every run passes before its row exists, however it was opened — over
 * HTTP, from the CLI, or by another run: a rubric that fits its pipeline,
 * recall only for a producer that consumes memories, a bar no lower than the
 * pipeline's, and an adoption that lines up. Each refusal is the pipe's own
 * 400 shape, so a refused request leaves nothing behind.
 */
export async function admitRun(
  request: StartQualityRunRequest,
  definition: PipelineDefinition<unknown>,
  repository: Pick<RunRepository, 'find'>,
): Promise<Adoption | undefined> {
  assertRubric(request, definition);
  assertRecall(request, definition);
  assertBar(request, definition);
  return adoptionOf(request, definition, repository);
}

/**
 * The recorded iteration an adopting request starts from — or a 400 that
 * names what does not line up: the run (unknown, or still running), its
 * pipeline or version, the iteration, or a rubric that is not the one it
 * was judged against. Read before the row opens, so a refused adoption
 * leaves nothing behind.
 */
async function adoptionOf(
  request: StartQualityRunRequest,
  definition: PipelineDefinition<unknown>,
  repository: Pick<RunRepository, 'find'>,
): Promise<Adoption | undefined> {
  const { adopt } = request;
  if (adopt === undefined) return undefined;
  // Declared with its type so the compiler narrows after each call.
  const refuse: (message: string, path?: 'adopt' | 'criteria') => never = (
    message,
    path = 'adopt',
  ) => {
    throw new BadRequestException({ message: 'invalid adopt', issues: [{ path, message }] });
  };
  if (request.output !== undefined) refuse('output and adopt are mutually exclusive');
  if (request.criteria === undefined) {
    refuse('adopt requires the rubric the adopted run was judged against', 'criteria');
  }
  const source = await repository.find(adopt.runId);
  if (source === null) refuse(`run ${adopt.runId} not found`);
  if (source.pipeline !== definition.id) {
    refuse(`run ${adopt.runId} ran ${source.pipeline}, not ${definition.id}`);
  }
  // Its status, not its trace: a running run's iterations so far are not a
  // verdict to adopt yet. One that stopped — completed, or failed after
  // recording some — has final ones, and any of them can be adopted.
  if (source.status === 'running') refuse(`run ${adopt.runId} is still running`);
  if (source.trace === null) refuse(`run ${adopt.runId} recorded no iteration`);
  if (source.trace.pipeline.version !== definition.version) {
    refuse(
      `run ${adopt.runId} was judged by ${definition.id}@${source.trace.pipeline.version}, not @${definition.version}`,
    );
  }
  const iteration = source.trace.iterations.find((it) => it.iteration === adopt.iteration);
  if (iteration === undefined) refuse(`run ${adopt.runId} has no iteration ${adopt.iteration}`);
  if (!sameRubric(request.criteria ?? [], source.trace.contract.criteria)) {
    refuse(`the rubric is not the one run ${adopt.runId} was judged against`, 'criteria');
  }
  return { iteration, adoptedFrom: source.request.adoptedFrom };
}

/** A rubric that does not fit the pipeline is refused before any row exists — the pipe's own 400 shape. */
function assertRubric(
  request: StartQualityRunRequest,
  definition: PipelineDefinition<unknown>,
): void {
  if (request.criteria === undefined) return;
  const problems = rubricProblems(request.criteria, definition.task);
  if (problems.length > 0) {
    throw new BadRequestException({
      message: 'invalid criteria',
      issues: problems.map((message) => ({ path: 'criteria', message })),
    });
  }
}

/** A run may raise its pipeline's accept threshold, never lower it: the pipeline's bar is a floor. */
function assertBar(request: StartQualityRunRequest, definition: PipelineDefinition<unknown>): void {
  const own = definition.policy.thresholds.acceptAt;
  if (request.acceptAt !== undefined && request.acceptAt < own) {
    throw new BadRequestException({
      message: `acceptAt ${request.acceptAt} is below the pipeline's accept threshold ${own}; a run may raise the bar, never lower it`,
      issues: [{ path: ['acceptAt'], message: `must be at least ${own}` }],
    });
  }
}

/**
 * Lessons a producer could never be handed are refused before any row
 * exists — the pipe's own 400 shape. Recall is for a producer that declares
 * it consumes memories; nothing else in a run can receive them.
 */
function assertRecall(
  request: StartQualityRunRequest,
  definition: PipelineDefinition<unknown>,
): void {
  if (request.recall !== true || definition.producer.consumes.includes('memories')) return;
  throw new BadRequestException({
    message: 'invalid recall',
    issues: [{ path: 'recall', message: `${definition.id}'s producer does not consume memories` }],
  });
}
