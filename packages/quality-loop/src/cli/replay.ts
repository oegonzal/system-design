/**
 * `main.js replay --pipeline <id> [--limit n]`
 *
 * Every recorded iteration of the pipeline's complete runs, decided again by
 * each controller in the library (and the pipeline's own, if it composed
 * one) under the pipeline's current policy. No model is called: a controller
 * is a pure function of the ledger, so two strategies are compared on the
 * same evidence. Prints one line per iteration, then where they disagree and
 * why, then the lowest each dimension sat among iterations the first
 * controller accepted — the number a floor is read off.
 */
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import type { QualityControlDecision } from '@sysdesign/contracts';

import { CONTROLLERS } from '../core/controllers';
import type { PipelineDefinition } from '../core/pipeline';
import type { Controller, RunRepository } from '../core/ports';
import { AppModule } from '../modules/app/app.module';
import { PIPELINES_TOKEN, RUN_REPOSITORY } from '../modules/runs/tokens';
import { intOr } from './args';

const REPLAY_USAGE = 'usage: replay --pipeline <id> [--limit <n>]';
const REPLAY_LIMIT = 100;

interface Replayed {
  runId: string;
  iteration: number;
  recorded: string;
  decisions: QualityControlDecision[];
}

/** The library's controllers, and the pipeline's own when it composed one. */
const controllersFor = (definition: PipelineDefinition<unknown>): Controller[] => {
  const controllers: Controller[] = [...CONTROLLERS.values()];
  if (!CONTROLLERS.has(definition.controller.id)) controllers.push(definition.controller);
  return controllers;
};

/** Every iteration of the newest complete runs, decided again by every controller. */
async function replayedRows(
  repository: RunRepository,
  definition: PipelineDefinition<unknown>,
  controllers: readonly Controller[],
  limit: number,
): Promise<{ rows: Replayed[]; runs: number }> {
  const [summaries] = await repository.list({
    pipeline: definition.id,
    status: 'complete',
    limit,
    offset: 0,
  });
  const rows: Replayed[] = [];
  for (const summary of summaries) {
    const run = await repository.find(summary.runId);
    if (!run?.trace) continue;
    for (const iteration of run.trace.iterations) {
      rows.push({
        runId: run.runId,
        iteration: iteration.iteration,
        recorded: iteration.decision.finalDecision,
        decisions: controllers.map((controller) =>
          controller.decide(iteration.ledger, definition.policy),
        ),
      });
    }
  }
  return { rows, runs: summaries.length };
}

/** One line per iteration: its recorded decision beside every controller's. */
function printTable(rows: readonly Replayed[], ids: readonly string[]): void {
  console.log(['run', 'it', 'overall', 'recorded', ...ids].join('\t'));
  for (const row of rows) {
    console.log(
      [
        row.runId,
        row.iteration,
        row.decisions[0].scores.overall,
        row.recorded,
        ...row.decisions.map((decision) => decision.finalDecision),
      ].join('\t'),
    );
  }
}

/** Where the controllers disagreed, and each one's reason. */
function printDisagreements(rows: readonly Replayed[], ids: readonly string[], runs: number): void {
  const differing = rows.filter(
    (row) => new Set(row.decisions.map((decision) => decision.finalDecision)).size > 1,
  );
  console.log(
    `\n${differing.length} of ${rows.length} iteration(s) across ${runs} run(s) decided differently`,
  );
  for (const row of differing) {
    row.decisions.forEach((decision, index) => {
      console.log(
        `  ${row.runId} it${row.iteration} ${ids[index]}: ${decision.finalDecision} — ${decision.reason}`,
      );
    });
  }
}

/** The lowest each dimension sat among the iterations the first controller accepted. */
function printFloors(rows: readonly Replayed[], first: string): void {
  const accepted = rows.filter((row) => row.decisions[0].finalDecision === 'accept');
  const minima = new Map<string, number>();
  for (const row of accepted) {
    for (const [dimension, score] of Object.entries(row.decisions[0].scores.dimensions)) {
      if (score === null) continue;
      minima.set(dimension, Math.min(minima.get(dimension) ?? score, score));
    }
  }
  console.log(
    `\nlowest each dimension sat among the ${accepted.length} iteration(s) ${first} accepted: ${
      minima.size === 0
        ? 'none'
        : [...minima].map(([dimension, score]) => `${dimension} ${score}`).join(', ')
    }`,
  );
}

export async function replayCli(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { pipeline: { type: 'string' }, limit: { type: 'string' } },
  });
  if (!values.pipeline) {
    console.error(REPLAY_USAGE);
    return 2;
  }
  const limit = intOr(values.limit, REPLAY_LIMIT) ?? REPLAY_LIMIT;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const pipelines = app.get<ReadonlyMap<string, PipelineDefinition<unknown>>>(PIPELINES_TOKEN);
    const repository = app.get<RunRepository>(RUN_REPOSITORY);
    const definition = pipelines.get(values.pipeline);
    if (!definition) {
      console.error(
        `unknown pipeline ${values.pipeline}; known: ${[...pipelines.keys()].join(', ')}`,
      );
      return 2;
    }
    const controllers = controllersFor(definition);
    const ids = controllers.map((controller) => controller.id);
    const { rows, runs } = await replayedRows(repository, definition, controllers, limit);
    printTable(rows, ids);
    printDisagreements(rows, ids, runs);
    printFloors(rows, ids[0]);
    return 0;
  } finally {
    await app.close();
  }
}
