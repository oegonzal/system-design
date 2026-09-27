import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, OpportunitiesModule],
  controllers: [HealthController],
})
export class AppModule {}
