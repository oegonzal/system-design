import { Module, type DynamicModule } from '@nestjs/common';
import { DbModule } from '@sysdesign/nest-kit';

import type { SessionConfig } from '../../config';
import { SessionModule } from '../session/session.module';

/** The database root and the session module, composed from the configuration the CLI loaded. */
@Module({})
export class AppModule {
  static register(config: SessionConfig): DynamicModule {
    return { module: AppModule, imports: [DbModule, SessionModule.register(config)] };
  }
}
