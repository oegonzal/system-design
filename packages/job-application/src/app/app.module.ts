import { Module, type DynamicModule } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { AdvisorController } from '../advisor';
import { ApplicationsController, ApplicationsModule } from '../applications';
import { ClockModule } from '../common/clock';
import type { JobApplicationConfig } from '../config';
import { IntakeModule } from '../intake';

/**
 * The composition root: the record and its policy, the intake over the bus,
 * and the routes — the advisor protocol's and the record's own. The only
 * place that knows every layer.
 */
@Module({})
export class AppModule {
  static register(config: JobApplicationConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DbModule,
        ClockModule,
        ApplicationsModule.register(config.settings.policy),
        IntakeModule.register(config.settings.intake, config.notificationsUrl),
      ],
      controllers: [HealthController, AdvisorController, ApplicationsController],
    };
  }
}
