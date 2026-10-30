/**
 * What a settled run says of itself to a caller that would draw on its best
 * iteration — its admission at the bar it was held to, and the locations of
 * its best artifact a reader withholds — read once, here, off engine facts
 * and the pipeline's own declarations, and answered on the run's read. The
 * bar is the one the run asked for, else its pipeline's: a run that raised
 * its bar is admitted at the raised one, as its controller decided it.
 * Nothing while the run is running, when it recorded no iteration, or when
 * no registered definition can read its artifact — a caller then has no
 * admission and withholds nothing, never a guess.
 */
import type { QualityRunDto, RunReadoutDto } from '@sysdesign/contracts';

import type { PipelineDefinition } from '../pipeline';
import { admission, outputsOf } from './run-outputs';
import { withheldOf } from './withheld';

export function readoutOf(
  definition: PipelineDefinition<unknown> | undefined,
  run: QualityRunDto,
): RunReadoutDto | null {
  if (definition === undefined || run.status === 'running' || run.trace === null) return null;
  const outputs = outputsOf(run.trace);
  return {
    admission: admission(outputs, run.request.acceptAt ?? definition.policy.thresholds.acceptAt),
    withheld: withheldOf(definition, outputs),
  };
}
