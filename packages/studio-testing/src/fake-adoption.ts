import {
  sameRubric,
  type IterationTrace,
  type QualityRunDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';

/**
 * The recorded iteration an adopting run starts from, or the loop's refusal
 * — the real loop's 400s and 404, reproduced: unknown run, wrong pipeline, a
 * run still running, no recorded iteration, no such iteration, a rubric that
 * differs from the adopted run's.
 */
export function resolveAdoption(
  request: StartQualityRunRequest,
  runs: ReadonlyMap<string, QualityRunDto>,
): IterationTrace {
  const adopt = request.adopt;
  if (!adopt) throw new Error('no adopt on the request');
  const source = runs.get(adopt.runId);
  if (!source) throw new LoopRefused(404, `adopt: unknown run ${adopt.runId}`);
  if (source.pipeline !== request.pipeline) {
    throw new LoopRefused(
      400,
      `adopt: run ${adopt.runId} ran ${source.pipeline}, not ${request.pipeline}`,
    );
  }
  // Its status, not its trace: a running run's iterations so far are not a
  // verdict to adopt yet; a stopped run's recorded ones are final.
  if (source.status === 'running') {
    throw new LoopRefused(400, `adopt: run ${adopt.runId} is still running`);
  }
  if (source.trace === null) {
    throw new LoopRefused(400, `adopt: run ${adopt.runId} recorded no iteration`);
  }
  const iteration = source.trace.iterations[adopt.iteration - 1];
  if (!iteration) {
    throw new LoopRefused(400, `adopt: run ${adopt.runId} has no iteration ${adopt.iteration}`);
  }
  if (
    request.criteria === undefined ||
    !sameRubric(request.criteria, source.trace.contract.criteria)
  ) {
    throw new LoopRefused(400, 'adopt: the rubric differs from the adopted run’s');
  }
  return iteration;
}
