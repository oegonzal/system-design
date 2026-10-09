/**
 * How the session reads a finished run back. Nothing here judges: the loop's
 * decision — with the blockers it names — the validators' problems and the
 * orchestrator's reported admission are turned into one route per action and
 * per field by declared rules, so a plan runs only as far as nobody objected
 * and a field is never filled when a judge pointed at it.
 *
 * `route-plan.ts` reads a plan back, `route-fields.ts` a page of field
 * answers; both start from the iteration the run judged best.
 */
import type { IterationTrace } from '../quality-loop/decision';
import type { QualityRunDto } from '../quality-loop/runs';

/** The iteration the run judged best, looked up by its number — never by its index. */
export function bestIterationOf(run: QualityRunDto): IterationTrace | null {
  const trace = run.trace;
  if (trace === null) return null;
  return trace.iterations.find((it) => it.iteration === trace.bestIteration) ?? null;
}
