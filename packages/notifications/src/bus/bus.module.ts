import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NOTIFICATION_TOPICS } from '@sysdesign/contracts';
import { BusEvent, BusSubscription } from '@sysdesign/db';

import { CLOCK, type Clock } from '../common/clock';
import { startPeriodic, type Periodic } from '../common/periodic';
import { Bus } from './bus';
import { EventsController } from './http/events.controller';
import { SubscriptionsController } from './http/subscriptions.controller';
import { MikroOrmEventLog } from './persistence/mikro-orm-event-log';
import { MikroOrmSubscriptionStore } from './persistence/mikro-orm-subscription-store';
import { BUS_SETTINGS, type BusSettings } from './settings';
import { InProcessWakeup } from './wakeup';

const logger = new Logger('Bus');

/** The bus's own sweep on its declared schedule, and every waiting pull released at shutdown. */
@Injectable()
class BusLifecycle implements OnModuleInit, OnModuleDestroy {
  private periodic: Periodic | null = null;

  constructor(
    private readonly bus: Bus,
    private readonly wakeup: InProcessWakeup,
    @Inject(BUS_SETTINGS) private readonly settings: BusSettings,
  ) {}

  onModuleInit(): void {
    this.periodic = startPeriodic(
      this.settings.sweepEveryMs,
      async () => {
        const swept = await this.bus.sweep(this.settings);
        if (swept.events + swept.subscriptions > 0) {
          logger.log(`swept ${swept.events} events and ${swept.subscriptions} idle subscriptions`);
        }
      },
      (message) => logger.warn(message),
    );
  }

  /** Before the store closes: the waiting pulls released, then the sweep in flight let finish. */
  async onModuleDestroy(): Promise<void> {
    this.wakeup.close();
    await this.periodic?.stop();
  }
}

/**
 * The bus: its tables, its HTTP surface and the `Bus` every other layer
 * publishes and subscribes through. Global, so the layers above reach the one
 * bus without importing this module again.
 */
@Module({})
export class BusModule {
  static register(settings: BusSettings): DynamicModule {
    return {
      module: BusModule,
      global: true,
      imports: [MikroOrmModule.forFeature([BusEvent, BusSubscription])],
      controllers: [EventsController, SubscriptionsController],
      providers: [
        { provide: BUS_SETTINGS, useValue: settings },
        InProcessWakeup,
        MikroOrmEventLog,
        MikroOrmSubscriptionStore,
        {
          provide: Bus,
          useFactory: (
            log: MikroOrmEventLog,
            subscriptions: MikroOrmSubscriptionStore,
            wakeup: InProcessWakeup,
            clock: Clock,
          ) => new Bus(NOTIFICATION_TOPICS, log, subscriptions, wakeup, clock),
          inject: [MikroOrmEventLog, MikroOrmSubscriptionStore, InProcessWakeup, CLOCK],
        },
        BusLifecycle,
      ],
      exports: [Bus],
    };
  }
}
