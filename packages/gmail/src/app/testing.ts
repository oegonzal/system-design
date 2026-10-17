import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { assertTestDatabase, TEST_DATABASE_NAME } from '@sysdesign/db/test-database';
import { LoopClient } from '@sysdesign/loop-client';
import { BusClient } from '@sysdesign/notifications-client';
import { RecordingBus } from '@sysdesign/notifications-client/testing';
import { OPERATOR_PORT, SESSION_EVENTS } from '@sysdesign/tool-session';
import {
  FakeEvents,
  FakeLoopClient,
  FakeOperator,
  sampleSettings,
  type ScriptedAnswer,
  type ScriptedRun,
} from '@sysdesign/tool-session/testing';

import type { GmailConfig } from '../config';
import { InMemoryMailbox } from '../mailbox/testing';
import { AppModule } from './app.module';

export const testConfig = (): Omit<GmailConfig, 'google'> => ({
  port: 0,
  loopUrl: 'http://loop.test',
  notificationsUrl: 'http://bus.test',
  peerUrls: [],
  settings: {
    session: sampleSettings(),
    watch: { enabled: false, pollEveryMs: 60_000, noticeTtlMs: 604_800_000 },
    peers: { peers: [] },
    mailbox: {
      searchMax: 10,
      searchCeiling: 25,
      bodyMaxLength: 6_000,
      messageInThreadMaxLength: 1_500,
      recovery: { windowMs: 0, pauseMs: 1 },
    },
    sources: {
      session: 'config/session/standard.json',
      watch: 'config/watch/standard.json',
      peers: 'config/peers/standard.json',
      mailbox: 'config/mailbox/standard.json',
    },
  },
});

/**
 * The service as `main` composes it, on a free port, over a mailbox in memory
 * with the loop, the operator and the bus faked, so the HTTP surface is
 * specced without reaching anything. The service reaches no database; the
 * guard still holds the lane a suite names to a test one.
 */
export async function bootApp(
  mailbox = new InMemoryMailbox(),
  script: readonly ScriptedRun[] = [],
  answers: readonly ScriptedAnswer[] = [],
): Promise<{
  app: INestApplication;
  url: string;
  mailbox: InMemoryMailbox;
  loop: FakeLoopClient;
  operator: FakeOperator;
  bus: RecordingBus;
}> {
  assertTestDatabase(process.env['DB_NAME'] ?? TEST_DATABASE_NAME, 'boot the mailbox service');
  const loop = new FakeLoopClient(script);
  const operator = new FakeOperator(answers);
  const bus = new RecordingBus();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ config: testConfig(), mailbox })],
  })
    .overrideProvider(LoopClient)
    .useValue(loop)
    .overrideProvider(BusClient)
    .useValue(bus)
    .overrideProvider(OPERATOR_PORT)
    .useValue(operator)
    .overrideProvider(SESSION_EVENTS)
    .useValue(new FakeEvents())
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), mailbox, loop, operator, bus };
}
