import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { BusModule } from '../bus';
import { createChannels } from '../channels';
import type { ChannelLog } from '../channels/port';
import { ClockModule } from '../common/clock';
import type { NotificationsConfig } from '../config';
import { InteractionsModule } from '../interactions';

const channelLog = (channel: string): ChannelLog => {
  const logger = new Logger(channel);
  return { log: (message) => logger.log(message), warn: (message) => logger.warn(message) };
};

/**
 * The composition root: the bus, the interactions over it, and the channels
 * the settings choose, built from their own settings and variables. The only
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
          createChannels(config.settings.channels, config.channelEnv, channelLog),
        ),
      ],
      controllers: [HealthController],
    };
  }
}
