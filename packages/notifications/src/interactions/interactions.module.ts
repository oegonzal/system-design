import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { startPeriodic, type Periodic } from '@sysdesign/contracts';
import { Interaction, InteractionDelivery } from '@sysdesign/db';

import { Bus } from '../bus';
import type { ChannelLog, NotificationChannel } from '../channels/port';
import { CLOCK, type Clock } from '../common/clock';
import { Dispatcher, sweepInteractions } from './dispatcher';
import { Inbound } from './inbound';
import { MikroOrmInteractionStore } from './persistence/mikro-orm-interaction-store';
import type { InteractionStore } from './ports';
import { INTERACTION_SETTINGS, type InteractionSettings } from './settings';

/** The channels the service runs, built once by the composition root; a spec puts its own here. */
export const CHANNELS = Symbol('CHANNELS');
const INTERACTION_STORE = Symbol('INTERACTION_STORE');

const logger = new Logger('Interactions');
const log: ChannelLog = {
  log: (message) => logger.log(message),
  warn: (message) => logger.warn(message),
};

/** The dispatcher started once every module is up, the sweep on its declared schedule, both stopped at shutdown. */
@Injectable()
class InteractionsLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private periodic: Periodic | null = null;

  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly inbound: Inbound,
    private readonly bus: Bus,
    @Inject(INTERACTION_STORE) private readonly store: InteractionStore,
    @Inject(INTERACTION_SETTINGS) private readonly settings: InteractionSettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dispatcher.start(this.inbound);
    this.periodic = startPeriodic(
      { everyMs: this.settings.sweepEveryMs, atStart: true },
      async () => {
        const swept = await sweepInteractions(this.bus, this.store, this.settings, this.clock());
        if (swept.expired + swept.purged > 0) {
          logger.log(
            `withdrew ${swept.expired} expired prompts, purged ${swept.purged} closed ones`,
          );
        }
      },
      (error) => log.warn(`sweep failed: ${String(error)}`),
    );
  }

  /** Before the store closes: the sweep in flight let finish, then the dispatcher and its channels stopped. */
  async onModuleDestroy(): Promise<void> {
    await this.periodic?.stop();
    await this.dispatcher.stop();
  }
}

/**
 * Prompts put to people: the dispatcher that delivers and closes them on every
 * channel, and the inbound reader that turns what people send back into
 * answers. Both reach the bus only through `Bus`, as any subscriber would.
 */
@Module({})
export class InteractionsModule {
  static register(
    settings: InteractionSettings,
    channels: () => readonly NotificationChannel[],
  ): DynamicModule {
    return {
      module: InteractionsModule,
      imports: [MikroOrmModule.forFeature([Interaction, InteractionDelivery])],
      providers: [
        { provide: INTERACTION_SETTINGS, useValue: settings },
        { provide: CHANNELS, useFactory: channels },
        { provide: INTERACTION_STORE, useClass: MikroOrmInteractionStore },
        {
          provide: Inbound,
          useFactory: (bus: Bus, store: InteractionStore, clock: Clock) =>
            new Inbound(bus, store, clock),
          inject: [Bus, INTERACTION_STORE, CLOCK],
        },
        {
          provide: Dispatcher,
          useFactory: (
            bus: Bus,
            store: InteractionStore,
            running: readonly NotificationChannel[],
            clock: Clock,
          ) => new Dispatcher(bus, store, running, settings, clock, log),
          inject: [Bus, INTERACTION_STORE, CHANNELS, CLOCK],
        },
        InteractionsLifecycle,
      ],
    };
  }
}
