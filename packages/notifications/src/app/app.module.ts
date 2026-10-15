import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { BusModule } from '../bus';
import { CHANNEL_DEFINITIONS, createChannels } from '../channels';
import type { ChannelLog } from '../channels/port';
import { ClockModule } from '../common/clock';
import type { NotificationsConfig } from '../config';
import { InteractionsModule } from '../interactions';

const channelLog = (channel: string): ChannelLog => {
  const logger = new Logger(channel);
  return { log: (message) => logger.log(message), warn: (message) => logger.warn(message) };
};

/**
 * The composition root: the bus, the interactions over it, and the channel
 * instances the settings choose, built from their kind's settings and their own
 * variables. The only
 * place that knows every layer.
 */
@Module({})
export class AppModule {
  static register(config: NotificationsConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DbModule,
        ClockModule,
        BusModule.register(config.settings.bus),
        InteractionsModule.register(config.settings.interactions, () =>
          createChannels(
            CHANNEL_DEFINITIONS,
            config.settings.channels,
            config.channelEnv,
            channelLog,
          ),
        ),
      ],
      controllers: [HealthController],
    };
  }
}
