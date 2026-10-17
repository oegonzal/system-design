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

import { InMemoryCalendar } from '../calendar/testing';
import type { GoogleCalendarConfig } from '../config';
import { AppModule } from './app.module';

export const testConfig = (): Omit<GoogleCalendarConfig, 'google'> => ({
  port: 0,
  loopUrl: 'http://loop.test',
  notificationsUrl: 'http://bus.test',
  peerUrls: [],
  settings: {
    session: sampleSettings(),
    watch: {
      enabled: false,
      pollEveryMs: 120_000,
      noticeTtlMs: 604_800_000,
      calendarId: 'primary',
    },
    peers: { peers: [] },
    scheduling: {
      timeZone: 'America/Los_Angeles',
      workingHours: { start: '09:00', end: '17:00' },
      workingDays: [1, 2, 3, 4, 5],
      slotMinutes: 30,
    },
    calendar: {
      listMax: 20,
      listCeiling: 50,
      suggestMax: 3,
      suggestCeiling: 10,
      recovery: { windowMs: 0, pauseMs: 1 },
    },
    sources: {
      session: 'config/session/standard.json',
      watch: 'config/watch/standard.json',
      peers: 'config/peers/standard.json',
      scheduling: 'config/scheduling/standard.json',
      calendar: 'config/calendar/standard.json',
    },
  },
});

/**
 * The service as `main` composes it, on a free port, over a calendar in
 * memory with the loop, the operator and the bus faked, so the HTTP surface
 * is specced without reaching anything. The service reaches no database; the
 * guard still holds the lane a suite names to a test one.
 */
export async function bootApp(
  calendar = new InMemoryCalendar(),
  script: readonly ScriptedRun[] = [],
  answers: readonly ScriptedAnswer[] = [],
): Promise<{
  app: INestApplication;
  url: string;
  calendar: InMemoryCalendar;
  loop: FakeLoopClient;
  operator: FakeOperator;
  bus: RecordingBus;
}> {
  assertTestDatabase(process.env['DB_NAME'] ?? TEST_DATABASE_NAME, 'boot the calendar service');
  const loop = new FakeLoopClient(script);
  const operator = new FakeOperator(answers);
  const bus = new RecordingBus();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ config: testConfig(), calendar, watch: false })],
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
  return { app, url: await app.getUrl(), calendar, loop, operator, bus };
}
