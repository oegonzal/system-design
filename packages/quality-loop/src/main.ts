import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { errorMessage } from '@sysdesign/contracts';

import { preflight } from './boot';
import { replayCli } from './cli/replay';
import { runCli } from './cli/run';
import { AppModule } from './modules/app/app.module';
import { configureApp } from './modules/app/configure-app';

const DEFAULT_PORT = 3003;

/**
 * The quality loop, three ways: `main.js run …` runs one pipeline from the
 * command line and exits; `main.js replay …` decides every recorded iteration
 * of a pipeline again under each controller and exits; anything else serves
 * the HTTP surface — runs, pipelines, criteria, prompts, orchestrations, the
 * memory and router tools, and `/health` (the README lists the routes).
 *
 * `serve` and `run` refuse to start without a Claude Code subscription login —
 * exit 1 saying how to get one, before any module boots. `replay` calls no
 * model and boots a slimmer context.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  const argv = process.argv.slice(2);
  let checked: Awaited<ReturnType<typeof preflight>>;
  try {
    checked = await preflight(argv, process.env);
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }

  if (checked.command === 'replay') {
    process.exit(await replayCli(argv.slice(1)));
  }
  if (checked.command === 'run') {
    process.exit(await runCli(argv.slice(1)));
  }

  const app = configureApp(await NestFactory.create(AppModule));
  // SIGTERM/SIGINT close the MikroORM pool instead of dropping connections.
  app.enableShutdownHooks();
  const port = process.env['QUALITY_LOOP_PORT']
    ? parseInt(process.env['QUALITY_LOOP_PORT'], 10)
    : DEFAULT_PORT;
  await app.listen(port);
  Logger.log(`quality-loop listening on http://localhost:${port}/health`);
  Logger.log(
    `quality-loop model: ${checked.model?.model ?? 'none'}${checked.source === null ? '' : ` — from ${checked.source}`}`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
