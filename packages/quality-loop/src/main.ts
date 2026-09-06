import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { runCli } from './cli';
import { AppModule } from './modules/app/app.module';

/**
 * The quality loop, two ways: `main.js run …` runs one pipeline from the
 * command line and exits; anything else serves the HTTP surface (POST /runs,
 * GET /runs/:id, GET /pipelines, GET /health).
 */
async function bootstrap() {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  if (process.argv[2] === 'run') {
    process.exit(await runCli(process.argv.slice(3)));
  }

  const app = await NestFactory.create(AppModule);
  const port = process.env['QUALITY_LOOP_PORT']
    ? parseInt(process.env['QUALITY_LOOP_PORT'], 10)
    : 3003;
  await app.listen(port);
  Logger.log(`quality-loop listening on http://localhost:${port}/health`);
}

bootstrap();
