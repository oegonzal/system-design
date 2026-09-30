import { Module } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { BidsModule } from '../bids/bids.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { PullsModule } from '../pulls/pulls.module';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [DbModule, SourcesModule, ProfilesModule, OpportunitiesModule, PullsModule, BidsModule],
  controllers: [HealthController],
})
export class AppModule {}
