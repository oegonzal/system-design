import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { configureApp } from './common/configure-app';
import { AppModule } from './modules/app/app.module';

async function bootstrap() {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  const app = await NestFactory.create(AppModule);

  // Prefix, CORS and the global ValidationPipe live in configureApp so the
  // integration tests boot an identically configured app.
  configureApp(app);

  const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000;
  await app.listen(port);
  Logger.log(`studio-api listening on http://localhost:${port}/api`);
}

bootstrap();
