import { Module } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { AwardsModule } from '../awards/awards.module';
import { BidsModule } from '../bids/bids.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { PullsModule } from '../pulls/pulls.module';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [
    DbModule,
    SourcesModule,
    ProfilesModule,
    AwardsModule,
    OpportunitiesModule,
    PullsModule,
    BidsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
