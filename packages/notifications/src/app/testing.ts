import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ensureDatabase } from '@sysdesign/db';

import { CHANNEL_DEFINITIONS } from '../channels';
import type { NotificationChannel } from '../channels/port';
import { notificationsConfigFromEnv, PACKAGE_ROOT } from '../config';
import { CHANNELS, type InteractionSettings } from '../interactions';
import { readSettings } from '../settings';
import { AppModule } from './app.module';

/**
 * The service as `main` composes it, on a free port over the test database:
 * the shipped settings with every sweep off, the channels a spec hands in,
 * and no variable read from the environment.
 */
export async function bootApp(
  options: {
    channels?: readonly NotificationChannel[];
    interactions?: Partial<InteractionSettings>;
  } = {},
): Promise<{ app: INestApplication; url: string }> {
  // Before anything connects: a database that is not a test one is refused here.
  await ensureDatabase();
  const shipped = readSettings(PACKAGE_ROOT);
  const settings = {
    ...shipped,
    bus: { ...shipped.bus, sweepEveryMs: null },
    interactions: { ...shipped.interactions, sweepEveryMs: null, ...options.interactions },
    channels: {},
  };
  const config = notificationsConfigFromEnv(settings, CHANNEL_DEFINITIONS, {});
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(CHANNELS)
    .useValue(options.channels ?? [])
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl() };
}
