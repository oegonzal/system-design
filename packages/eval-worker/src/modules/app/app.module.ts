import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { ImproverModule } from '../improver/improver.module';
import { PollerModule } from '../poller/poller.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, PollerModule, ImproverModule],
  controllers: [HealthController],
})
export class AppModule {}
