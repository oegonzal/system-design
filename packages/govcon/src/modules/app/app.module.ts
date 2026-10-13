import { Module } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { AwardsModule } from '../awards/awards.module';
import { BidsModule } from '../bids/bids.module';
import { EntitiesModule } from '../entities/entities.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { PullsModule } from '../pulls/pulls.module';
import { SourcesModule } from '../sources/sources.module';
import { SpendingModule } from '../spending/spending.module';

@Module({
  imports: [
    DbModule,
    SourcesModule,
    ProfilesModule,
    AwardsModule,
    OpportunitiesModule,
    PullsModule,
    BidsModule,
    EntitiesModule,
    SpendingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
