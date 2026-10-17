import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { assertTestDatabase, TEST_DATABASE_NAME } from '@sysdesign/db/test-database';
import { LoopClient } from '@sysdesign/loop-client';
import { BusClient } from '@sysdesign/notifications-client';

import type { RunnableTool } from '../catalog';
import { ToolCatalog } from '../catalog';
import {
  FakeEvents,
  FakeLoopClient,
  FakeOperator,
  sampleSettings,
  type ScriptedRun,
} from '../session/testing';
import { ToolSessionModule } from './tool-session.module';
import { OPERATOR_PORT, SESSION_EVENTS } from './tokens';

export interface BootedToolSessionApp {
  app: INestApplication;
  url: string;
  loop: FakeLoopClient;
  operator: FakeOperator;
  events: FakeEvents;
}

/** A bus nothing reaches: the module builds one from a URL, and the fakes stand in for everything that uses it. */
class UnreachableBus extends BusClient {
  private refuse(): never {
    throw new Error('the test bus is not there');
  }
  publish(): never {
    return this.refuse();
  }
  subscribe(): never {
    return this.refuse();
  }
  pull(): never {
    return this.refuse();
  }
  ack(): never {
    return this.refuse();
  }
  unsubscribe(): never {
    return this.refuse();
  }
}

/**
 * The module as a program composes it, on a free port, with the loop, the
 * operator and the events faked — so a program's HTTP surface, and this
 * library's own, are specced without reaching anything.
 */
export async function bootToolSessionApp(
  tools: readonly RunnableTool[],
  script: readonly ScriptedRun[] = [],
  answers: ConstructorParameters<typeof FakeOperator>[0] = [],
  service = 'example',
): Promise<BootedToolSessionApp> {
  // The module reaches no database; the guard still holds the lane a program's suite names to a test one.
  assertTestDatabase(process.env['DB_NAME'] ?? TEST_DATABASE_NAME, 'boot a tool-session app');
  const loop = new FakeLoopClient(script);
  const operator = new FakeOperator(answers);
  const events = new FakeEvents();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ToolSessionModule.register({
        service,
        catalog: new ToolCatalog(tools),
        peers: [],
        loopUrl: 'http://loop.test',
        notificationsUrl: 'http://bus.test',
        settings: sampleSettings(),
      }),
    ],
  })
    .overrideProvider(LoopClient)
    .useValue(loop)
    .overrideProvider(BusClient)
    .useValue(new UnreachableBus())
    .overrideProvider(OPERATOR_PORT)
    .useValue(operator)
    .overrideProvider(SESSION_EVENTS)
    .useValue(events)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), loop, operator, events };
}
