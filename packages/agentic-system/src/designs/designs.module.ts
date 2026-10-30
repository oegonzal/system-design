import { Module, type DynamicModule } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MemoryDesignCycle } from '@sysdesign/db';
import { HttpLoopClient, LoopClient } from '@sysdesign/loop-client';
import { HttpBusClient } from '@sysdesign/notifications-client';

import { CLOCK, type Clock } from '../common/clock';
import { IDS, type Ids } from '../common/ids';

import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';
import { MemoryDesignDriver } from './driver';
import { MikroOrmCycleStore } from './persistence/mikro-orm-cycle-store';
import { CYCLE_STORE, EVENT_SINK } from './ports';
import type { DesignSettings } from './settings';
import { HttpBusEventSink } from './events/http-bus-event-sink';

/** What the design cycle is wired from — the two service URLs and the declared cycle settings. */
export interface DesignsModuleOptions {
  loopUrl: string;
  notificationsUrl: string;
  design: DesignSettings;
}

/**
 * The design cycle wired to its ports: cycles in Postgres through the MikroORM
 * store (the `memory_design_cycle` table), the loop client and the bus as HTTP
 * adapters built from the service URLs, and the driver composed from the loop
 * client and the cycle settings.
 */
@Module({})
export class DesignsModule {
  static register(options: DesignsModuleOptions): DynamicModule {
    return {
      module: DesignsModule,
      imports: [MikroOrmModule.forFeature([MemoryDesignCycle])],
      providers: [
        { provide: CYCLE_STORE, useClass: MikroOrmCycleStore },
        { provide: LoopClient, useFactory: () => new HttpLoopClient(options.loopUrl) },
        {
          provide: EVENT_SINK,
          useFactory: (clock: Clock, ids: Ids) =>
            new HttpBusEventSink(new HttpBusClient(options.notificationsUrl), clock, ids),
          inject: [CLOCK, IDS],
        },
        {
          provide: MemoryDesignDriver,
          useFactory: (loop: LoopClient) => new MemoryDesignDriver(loop, options.design),
          inject: [LoopClient],
        },
        DesignsService,
      ],
      controllers: [DesignsController],
      exports: [DesignsService],
    };
  }
}
