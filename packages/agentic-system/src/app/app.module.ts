import { Module, type DynamicModule } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { ClockModule } from '../common/clock';
import { IdsModule } from '../common/ids';
import type { AgenticSystemConfig } from '../config';
import { DesignsModule } from '../designs';
import { MemoryModule } from '../memory';

/**
 * The composition root: the database, the clock and the ids, the design cycle and the
 * memory spaces wired to their ports, and the routes — each layer's own and the
 * health check. The one place that reads the whole config and hands each layer
 * only what it needs.
 */
@Module({})
export class AppModule {
  static register(config: AgenticSystemConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DbModule,
        ClockModule,
        IdsModule,
        DesignsModule.register({
          loopUrl: config.loopUrl,
          notificationsUrl: config.notificationsUrl,
          design: config.settings.design,
        }),
        MemoryModule.register({
          loopUrl: config.loopUrl,
          embedder: config.embedder,
          memory: config.settings.memory,
          policySource: config.settings.policySource,
        }),
      ],
      controllers: [HealthController],
    };
  }
}
