import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { PollerModule } from '../poller/poller.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, PollerModule],
  controllers: [HealthController],
})
export class AppModule {}
