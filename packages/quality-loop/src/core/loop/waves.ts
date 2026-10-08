/**
 * The lenses run in waves by what they declare they consume, every sample an
 * independent unit, and the deterministic normaliser is the boundary between
 * waves: a later lens is shown what the first wave CONFIRMED, never a raw
 * report.
 */
import type { CriticReport, EvaluationReport, LensOutcome } from '@sysdesign/contracts';

import { annotate } from '../evidence/annotate';
import { normalize } from '../evidence/normalize';
import type { PipelineDefinition } from '../pipeline';
import type { Critic, Evaluator, LensContext, Stages } from '../ports';
import { mapConcurrent } from './scoped-llm';

/** What a wave, or an iteration, came to: every critic and evaluator sample, in declaration order. */
export type Judged = {
  critics: LensOutcome<CriticReport>[];
  evaluators: LensOutcome<EvaluationReport>[];
};

/** One sample's outcome, tagged by which half of the wave it came from. */
type LensResult =
  | { critic: LensOutcome<CriticReport>; evaluator?: undefined }
  | { evaluator: LensOutcome<EvaluationReport>; critic?: undefined };

/**
 * Two waves, by declaration. Lenses that consume nothing judge the artifact
 * alone; what the normaliser CONFIRMS from them is what the second wave is
 * shown. The deterministic normaliser is the boundary between tiers — a
 * downstream lens never sees a raw report.
 */
export async function runLensWaves<T>(
  stages: Stages<T>,
  ctx: LensContext<T>,
  policy: PipelineDefinition<T>['policy'],
): Promise<Judged> {
  const firstWave = <L extends { consumes: readonly unknown[] }>(lenses: readonly L[]): L[] =>
    lenses.filter((lens) => lens.consumes.length === 0);
  const laterWave = <L extends { consumes: readonly unknown[] }>(lenses: readonly L[]): L[] =>
    lenses.filter((lens) => lens.consumes.length > 0);

  const first = await runWave(
    firstWave(stages.critics),
    firstWave(stages.evaluators),
    ctx,
    policy.loop.concurrency,
  );
  const laterCritics = laterWave(stages.critics);
  const laterEvaluators = laterWave(stages.evaluators);
  if (laterCritics.length + laterEvaluators.length === 0) return first;

  const confirmed = normalize(
    {
      contract: ctx.contract,
      artifactPresent: true,
      locations: ctx.locations,
      validation: ctx.validation,
      critics: first.critics,
      evaluators: first.evaluators,
      diagnostics: [],
    },
    policy,
  );
  const second = await runWave(
    laterCritics,
    laterEvaluators,
    {
      ...ctx,
      upstream: {
        findings: annotate(confirmed.findings, first.critics, ctx.locations),
        results: confirmed.criteria.filter((evidence) => evidence.result !== 'unassessed'),
      },
    },
    policy.loop.concurrency,
  );
  return {
    critics: [...first.critics, ...second.critics],
    evaluators: [...first.evaluators, ...second.evaluators],
  };
}

/**
 * One wave, every lens SAMPLE an independent unit, at most `concurrency` in
 * flight, results in declaration order.
 *
 * The unit is the sample rather than the lens because a lens's samples have
 * nothing to say to each other: they are separate draws whose agreement is the
 * signal. Scheduling the lens meant one slot carried a lens's samples one
 * after another, so a wave finished at the pace of its slowest lens rather
 * than its slowest call, with the other slots idle.
 *
 * Every prompt is built first, by `plan`, and `mapConcurrent` writes each
 * result back into its own position — so what comes out is ordered by
 * declaration and ascending sample whatever order the answers arrived in.
 * `wave-order.spec.ts` is the guard on that, and it is load-bearing: three
 * things downstream read this array's order, and all three reach the grade.
 */
async function runWave<T>(
  critics: readonly Critic<T>[],
  evaluators: readonly Evaluator<T>[],
  ctx: LensContext<T>,
  concurrency: number,
): Promise<Judged> {
  const units: (() => Promise<LensResult>)[] = [
    ...critics.flatMap((critic) =>
      critic.plan(ctx).map((unit) => async (): Promise<LensResult> => ({ critic: await unit() })),
    ),
    ...evaluators.flatMap((evaluator) =>
      evaluator
        .plan(ctx)
        .map((unit) => async (): Promise<LensResult> => ({ evaluator: await unit() })),
    ),
  ];
  const results = await mapConcurrent(units, concurrency, (run) => run());
  return {
    critics: results.flatMap((result) => (result.critic ? [result.critic] : [])),
    evaluators: results.flatMap((result) => (result.evaluator ? [result.evaluator] : [])),
  };
}
