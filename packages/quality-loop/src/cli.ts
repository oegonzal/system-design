/**
 * `main.js run --pipeline <id> --goal <file.md> [--output <file.json>] [--iterations n]`
 *
 * The goal file is read verbatim as the inputGoal. Boots the same Nest context
 * the HTTP surface uses, runs to completion, prints a summary and exits by the
 * decision. The dump under the run-dump directory is the full record.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { dumpDir } from '@sysdesign/run-dump';

import { AppModule } from './modules/app/app.module';
import { RunsService } from './modules/runs/runs.service';

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
