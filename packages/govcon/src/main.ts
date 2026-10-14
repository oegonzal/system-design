import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { cli } from './cli';
import { AppModule } from './modules/app/app.module';
import { configureApp } from './modules/app/configure-app';
import { PullScheduler } from './modules/pulls/pull-scheduler';
import { SpendingWarmer } from './modules/spending/warm/spending-warmer';

/**
 * govcon, two ways. `main.js pull | leads | search | show` runs one command
 * over the Nest context and exits by its result; `main.js serve` serves the
 * same service over HTTP (GET /profiles, GET /source, GET /source/calls,
 * POST /pulls, GET /leads, GET /notices/:id, POST /notices/:id/description,
 * GET /spending/*, GET /health) for the web client, and alone starts the
 * jobs that run on a cadence — a lifecycle hook would run them under every
 * CLI command too.
 */

/** What `serve` starts once it listens: the daily pull, and the daily spending warm. */
const SERVE_JOBS = [PullScheduler, SpendingWarmer] as const;

async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  if (process.argv[2] === 'serve') {
    await serve();
    return;
  }
  process.exit(await cli(process.argv.slice(2)));
}

async function serve(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  // SIGTERM/SIGINT close the MikroORM pool instead of dropping connections.
  app.enableShutdownHooks();
  const port = process.env['GOVCON_PORT'] ? parseInt(process.env['GOVCON_PORT'], 10) : 3004;
  await app.listen(port);
  Logger.log(`govcon listening on http://localhost:${port}/health`);
  for (const job of SERVE_JOBS) app.get(job).start();
}

bootstrap();
