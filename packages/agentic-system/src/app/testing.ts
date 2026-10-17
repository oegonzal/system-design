import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ensureDatabase } from '@sysdesign/db';
import { LoopClient } from '@sysdesign/loop-client';

import { CLOCK } from '../common/clock';
import { EVENT_SINK } from '../designs';
import { FakeEventSink, FakeLoopClient } from '../designs/testing';
import type { AgenticSystemConfig } from '../config';
import { AppModule } from './app.module';

const testConfig = (): AgenticSystemConfig => ({
  port: 0,
  loopUrl: 'http://loop.test',
  notificationsUrl: 'http://bus.test',
  settings: {
    design: {
      pipeline: 'memory-architecture',
      orchestrator: 'memory-design',
      maxIterations: 3,
      recall: true,
      pollEveryMs: 1,
    },
    sources: { design: 'config/design/standard.json' },
  },
});

/**
 * The service as `main` composes it, on a free port over the test database,
 * with the loop faked so the HTTP surface is specced without reaching it. A
 * database that is not a test one is refused here first.
 */
export async function bootApp(): Promise<{
  app: INestApplication;
  url: string;
  loop: FakeLoopClient;
}> {
  await ensureDatabase();
  const loop = new FakeLoopClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(testConfig())] })
    .overrideProvider(LoopClient)
    .useValue(loop)
    .overrideProvider(EVENT_SINK)
    .useValue(new FakeEventSink())
    .overrideProvider(CLOCK)
    .useValue((): Date => new Date('2026-10-16T00:00:00Z'))
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), loop };
}
