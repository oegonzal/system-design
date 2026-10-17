import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { HttpLoopClient, LoopClient } from '@sysdesign/loop-client';
import { BusClient, HttpBusClient, InteractionClient } from '@sysdesign/notifications-client';

import { HttpToolProvider, ToolCatalog } from '../catalog';
import {
  BusSessionEvents,
  InteractionOperator,
  SessionRegistry,
  type OperatorPort,
  type SessionEventsPort,
} from '../session';
import type { ToolSessionSettings } from '../settings';
import { SessionsController } from './sessions.controller';
import { OPERATOR_PORT, SESSION_EVENTS } from './tokens';
import { ToolsController } from './tools.controller';

/** What a program runs tool sessions with: who it is on the bus, its tools, its peers, and where the loop and the bus are. */
export interface ToolSessionModuleOptions {
  /** The source the program publishes under; the channel that carries it is the person's. */
  service: string;
  catalog: ToolCatalog;
  /** Other programs whose tools join every session, by the URL each serves `/tools` at. */
  peers: readonly string[];
  loopUrl: string;
  notificationsUrl: string;
  settings: ToolSessionSettings;
}

/**
 * Tool sessions as a Nest module: the loop and the bus as HTTP adapters built
 * from the two URLs with the declared recovery windows, the operator and the
 * events over the bus, the registry over all of it, and the two controllers.
 * A program may override the operator and the events by their tokens — a
 * spec does — and reads the bus client and the registry it exports.
 */
@Module({})
export class ToolSessionModule {
  static register(options: ToolSessionModuleOptions): DynamicModule {
    const log = new Logger('ToolSession');
    return {
      module: ToolSessionModule,
      providers: [
        { provide: ToolCatalog, useValue: options.catalog },
        {
          provide: LoopClient,
          useFactory: () =>
            new HttpLoopClient(options.loopUrl, fetch, options.settings.loopRecovery),
        },
        {
          provide: BusClient,
          useFactory: () =>
            new HttpBusClient(options.notificationsUrl, { recovery: options.settings.busRecovery }),
        },
        {
          provide: OPERATOR_PORT,
          useFactory: (bus: BusClient): OperatorPort =>
            new InteractionOperator(
              new InteractionClient(bus, {
                source: options.service,
                pullWaitMs: options.settings.operator.pullWaitMs,
                eventsPerPull: options.settings.operator.eventsPerPull,
              }),
              bus,
              options.service,
            ),
          inject: [BusClient],
        },
        {
          provide: SESSION_EVENTS,
          useFactory: (bus: BusClient): SessionEventsPort =>
            new BusSessionEvents(bus, options.service, {
              info: (line) => log.log(line),
              warn: (line) => log.warn(line),
            }),
          inject: [BusClient],
        },
        {
          provide: SessionRegistry,
          useFactory: (
            loop: LoopClient,
            catalog: ToolCatalog,
            operator: OperatorPort,
            events: SessionEventsPort,
          ) =>
            new SessionRegistry(
              {
                loop,
                catalog,
                operator,
                events,
                clock: () => new Date(),
                log: { info: (line) => log.log(line), warn: (line) => log.warn(line) },
              },
              options.service,
              options.settings,
              options.peers.map((url) => new HttpToolProvider(url)),
            ),
          inject: [LoopClient, ToolCatalog, OPERATOR_PORT, SESSION_EVENTS],
        },
      ],
      controllers: [SessionsController, ToolsController],
      exports: [SessionRegistry, ToolCatalog, BusClient],
    };
  }
}
