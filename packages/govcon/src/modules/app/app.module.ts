import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';

@Module({
  imports: [DbModule, OpportunitiesModule],
})
export class AppModule {}
