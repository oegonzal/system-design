/**
 * The router's two steps, as adapters over its one port. `classify` asks the
 * classifier for a judge among the registered routes; `judge` runs it. A
 * brief that cannot be placed fails the run: dispatch is the deliverable, and
 * a record that completed with nothing judged would be a lie. The runner's
 * declared-pipeline check, not the classifier, is what dispatches: the judge
 * step's pipeline is whatever `classify` produced, and only that.
 */
import type { QualityRunDto, RouterContextDto, RouterStepReason } from '@sysdesign/contracts';
import { DEFAULT_QUALITY_RUN_ITERATIONS } from '@sysdesign/contracts';

import { briefRoutes, requestInput, runTarget } from '../common';
import type { StepContext, StepResult } from '../runner/definition';
import type { RouterPorts } from './ports';

export interface RouterOutputs {
  classify: { pipeline: string };
  judge: QualityRunDto;
}

type Ctx = StepContext<RouterOutputs, RouterPorts>;

const unplaced = (reason: RouterStepReason, message: string, counts = {}): StepResult<never> => ({
  status: 'failed',
  reason,
  counts,
  error: { name: 'Unrouted', message, stack: null },
});

/** Which registered judge the brief belongs to; yields the pipeline the judge step runs. */
export async function classify(ctx: Ctx): Promise<StepResult<{ pipeline: string }>> {
  const routes = briefRoutes(ctx.registry);
  const counts = { routes: routes.length };
  if (routes.length === 0) return unplaced('no-routes', 'no registered pipeline takes a brief');
  if (!ctx.ports.classifier.enabled) {
    const { reason } = (ctx.context as unknown as RouterContextDto).classifier;
    return unplaced(
      'classifier-disabled',
      `no model to classify with: ${reason ?? 'disabled'}`,
      counts,
    );
  }
  const answer = await ctx.ports.classifier.classify(ctx.request.goal, routes);
  if (answer === null) {
    return unplaced(
      'unclassified',
      'the classifier named no registered judge for this brief',
      counts,
    );
  }
  return {
    status: 'complete',
    note: answer.rationale,
    counts,
    output: { pipeline: answer.pipeline },
  };
}

/**
 * Run the judge `classify` chose. Judged once unless the request asks for
 * more: with no pipeline named at open, the record's iteration budget is the
 * request's or the default, and the child must agree with the record.
 */
export const judge = (ctx: Ctx): Promise<StepResult<QualityRunDto>> =>
  runTarget(ctx, {
    ...requestInput(ctx.request),
    maxIterations: ctx.request.maxIterations ?? DEFAULT_QUALITY_RUN_ITERATIONS,
  });
