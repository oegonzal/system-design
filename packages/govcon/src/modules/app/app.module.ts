import { Module } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { OpportunitiesModule } from '../opportunities/opportunities.module';

@Module({
  imports: [DbModule, OpportunitiesModule],
  controllers: [HealthController],
})
export class AppModule {}
