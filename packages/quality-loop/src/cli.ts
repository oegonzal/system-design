/**
 * `main.js run --pipeline <id> --goal <file.md> [--output <file.json>] [--iterations n]`
 *
 * The goal file is read verbatim as the inputGoal. Boots the same Nest context
 * the HTTP surface uses, runs to completion, prints a summary and exits by the
 * decision. The dump under the run-dump directory is the full record.
 *
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
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import type { QualityControlDecision } from '@sysdesign/contracts';
import { dumpDir } from '@sysdesign/run-dump';

import { CONTROLLERS } from './core/controllers';
import type { PipelineDefinition } from './core/pipeline';
import type { Controller, RunRepository } from './core/ports';
import { AppModule } from './modules/app/app.module';
import { RunsService } from './modules/runs/runs.service';
import { PIPELINES_TOKEN, RUN_REPOSITORY } from './modules/runs/tokens';

const USAGE =
  'usage: run --pipeline <id> --goal <file.md> [--output <file.json>] [--iterations <n>]';

export async function runCli(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      pipeline: { type: 'string' },
      goal: { type: 'string' },
      output: { type: 'string' },
      iterations: { type: 'string' },
    },
  });
  if (!values.pipeline || !values.goal) {
    console.error(USAGE);
    return 2;
  }

  const goal = readFileSync(resolve(values.goal), 'utf8');
  const output = values.output
    ? (JSON.parse(readFileSync(resolve(values.output), 'utf8')) as unknown)
    : undefined;
  const maxIterations = values.iterations ? parseInt(values.iterations, 10) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const record = await app
      .get(RunsService)
      .execute({ pipeline: values.pipeline, goal, output, maxIterations });
    const last = record.trace?.iterations[record.trace.iterations.length - 1] ?? null;
    console.log(
      JSON.stringify(
        {
          runId: record.runId,
          status: record.status,
          pipeline: record.pipeline,
          llm: record.llm,
          finalDecision: record.trace?.finalDecision ?? null,
          stopReason: record.trace?.stopReason ?? null,
          overall: last?.decision.scores.overall ?? null,
          reason: last?.decision.reason ?? null,
          iterations: record.trace?.iterations.length ?? 0,
          exchanges: record.exchanges.length,
          error: record.error?.message ?? null,
          dump: join(dumpDir(), record.runId),
        },
        null,
        2,
      ),
    );
    return record.status === 'failed' ? 1 : 0;
  } finally {
    await app.close();
  }
}

const REPLAY_USAGE = 'usage: replay --pipeline <id> [--limit <n>]';
const REPLAY_LIMIT = 100;

interface Replayed {
  runId: string;
  iteration: number;
  recorded: string;
  decisions: QualityControlDecision[];
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
  const limit = values.limit ? parseInt(values.limit, 10) : REPLAY_LIMIT;

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
    const controllers: Controller[] = [...CONTROLLERS.values()];
    if (!CONTROLLERS.has(definition.controller.id)) controllers.push(definition.controller);

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

    const ids = controllers.map((controller) => controller.id);
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

    const differing = rows.filter(
      (row) => new Set(row.decisions.map((decision) => decision.finalDecision)).size > 1,
    );
    console.log(
      `\n${differing.length} of ${rows.length} iteration(s) across ${summaries.length} run(s) decided differently`,
    );
    for (const row of differing) {
      row.decisions.forEach((decision, index) => {
        console.log(
          `  ${row.runId} it${row.iteration} ${ids[index]}: ${decision.finalDecision} — ${decision.reason}`,
        );
      });
    }

    const accepted = rows.filter((row) => row.decisions[0].finalDecision === 'accept');
    const minima = new Map<string, number>();
    for (const row of accepted) {
      for (const [dimension, score] of Object.entries(row.decisions[0].scores.dimensions)) {
        if (score === null) continue;
        minima.set(dimension, Math.min(minima.get(dimension) ?? score, score));
      }
    }
    console.log(
      `\nlowest each dimension sat among the ${accepted.length} iteration(s) ${ids[0]} accepted: ${
        minima.size === 0
          ? 'none'
          : [...minima].map(([dimension, score]) => `${dimension} ${score}`).join(', ')
      }`,
    );
    return 0;
  } finally {
    await app.close();
  }
}
