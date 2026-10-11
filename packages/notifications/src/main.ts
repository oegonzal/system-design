import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { CHANNEL_DEFINITIONS } from './channels';
import { notificationsConfigFromEnv, PACKAGE_ROOT } from './config';
import { readSettings } from './settings';

/**
 * The notifications service: the project's event bus over HTTP — declared
 * topics, named subscriptions pulled and acknowledged (POST /events,
 * PUT|DELETE /subscriptions/:name, GET /subscriptions/:name/events,
 * POST /subscriptions/:name/ack, GET /health) — and the channels that put
 * prompts in front of people and bring their answers back as events.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  const settings = readSettings(PACKAGE_ROOT);
  const config = notificationsConfigFromEnv(settings, CHANNEL_DEFINITIONS);
  const app = await NestFactory.create(AppModule.register(config));
  // SIGTERM/SIGINT release waiting pulls, stop the channels and close the pool.
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('Notifications');
  logger.log(`notifications listening on http://localhost:${config.port}/health`);
  logger.log(
    `settings: ${Object.entries(settings.sources)
      .map(([kind, source]) => `${kind} ${source}`)
      .join(', ')}`,
  );
  const running = Object.keys(settings.channels);
  logger.log(`channels: ${running.length === 0 ? 'none' : running.join(', ')}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
