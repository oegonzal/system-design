import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { jobApplicationConfigFromEnv, PACKAGE_ROOT } from './config';
import { readSettings } from './settings';

/**
 * The job-application service: the record of the units a browser session
 * applied to, fed by the session's events on the bus, and the advisor the
 * session asks before every plan what is on record (GET /advisor,
 * POST /advice) — beside the record's own routes (GET /applications,
 * GET /companies, POST /applications, PATCH /applications/:id, GET /health).
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  const settings = readSettings(PACKAGE_ROOT);
  const config = jobApplicationConfigFromEnv(settings);
  const app = await NestFactory.create(AppModule.register(config));
  // SIGTERM/SIGINT stop the intake's pull and close the pool.
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('JobApplication');
  logger.log(`job-application listening on http://localhost:${config.port}/health`);
  logger.log(
    `settings: ${Object.entries(settings.sources)
      .map(([kind, source]) => `${kind} ${source}`)
      .join(', ')}`,
  );
  logger.log(`bus: ${config.notificationsUrl}, subscription ${settings.intake.subscription}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
