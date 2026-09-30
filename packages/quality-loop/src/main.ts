import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

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
 */
async function bootstrap() {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  if (process.argv[2] === 'replay') {
    process.exit(await replayCli(process.argv.slice(3)));
  }
  if (process.argv[2] === 'run') {
    process.exit(await runCli(process.argv.slice(3)));
  }

  const app = configureApp(await NestFactory.create(AppModule));
  // SIGTERM/SIGINT close the MikroORM pool instead of dropping connections.
  app.enableShutdownHooks();
  const port = process.env['QUALITY_LOOP_PORT']
    ? parseInt(process.env['QUALITY_LOOP_PORT'], 10)
    : DEFAULT_PORT;
  await app.listen(port);
  Logger.log(`quality-loop listening on http://localhost:${port}/health`);
}

bootstrap();
