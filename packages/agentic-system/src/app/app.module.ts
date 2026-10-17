import { Module, type DynamicModule } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { ClockModule } from '../common/clock';
import type { AgenticSystemConfig } from '../config';
import { DesignsModule } from '../designs';

/**
 * The composition root: the database, the clock, the design cycle wired to its
 * ports, and the routes — the design cycle's own and the health check. The one
 * place that reads the whole config and hands each layer only what it needs.
 */
@Module({})
export class AppModule {
  static register(config: AgenticSystemConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DbModule,
        ClockModule,
        DesignsModule.register({
          loopUrl: config.loopUrl,
          notificationsUrl: config.notificationsUrl,
          design: config.settings.design,
        }),
      ],
      controllers: [HealthController],
    };
  }
}
