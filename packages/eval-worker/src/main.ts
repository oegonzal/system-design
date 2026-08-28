import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './modules/app/app.module';

/**
 * The dedicated background process: claims eval jobs from Postgres, runs the
 * engine + critic, persists results. HTTP surface is a bare /health — nothing
 * else talks to this service directly.
 */
async function bootstrap() {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  const app = await NestFactory.create(AppModule);

  const port = process.env['WORKER_PORT'] ? parseInt(process.env['WORKER_PORT'], 10) : 3002;
  await app.listen(port);
  Logger.log(`eval-worker listening on http://localhost:${port}/health`);
}

bootstrap();
