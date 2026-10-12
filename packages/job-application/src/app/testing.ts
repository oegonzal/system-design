import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ensureDatabase } from '@sysdesign/db';

import { jobApplicationConfigFromEnv, PACKAGE_ROOT } from '../config';
import { BUS } from '../intake';
import { FakeBusClient } from '../intake/testing';
import { readSettings } from '../settings';
import { AppModule } from './app.module';

/**
 * The service as `main` composes it, on a free port over the test database:
 * the shipped settings, the bus a fake the spec feeds, and no variable read
 * from the environment.
 */
export async function bootApp(): Promise<{
  app: INestApplication;
  url: string;
  bus: FakeBusClient;
}> {
  // Before anything connects: a database that is not a test one is refused here.
  await ensureDatabase();
  const settings = readSettings(PACKAGE_ROOT);
  const config = jobApplicationConfigFromEnv(settings, {});
  const bus = new FakeBusClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(BUS)
    .useValue(bus)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), bus };
}
