import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconBid, GovconOpportunity } from '@sysdesign/db';

import { AwardsModule } from '../awards/awards.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { LeadsController } from './leads.controller';
import { NoticesController } from './notices.controller';
import { OpportunitiesService } from './opportunities.service';
import { MikroOrmBidRepository } from './persistence/mikro-orm-bid-repository';
import { MikroOrmOpportunityRepository } from './persistence/mikro-orm-opportunity-repository';
import { BID_REPOSITORY, OPPORTUNITY_REPOSITORY } from './tokens';

/** The stored notices: the repositories (notices and their bids), the ranking and the description on demand. */
@Module({
  imports: [
    MikroOrmModule.forFeature([GovconOpportunity, GovconBid]),
    SourcesModule,
    ProfilesModule,
    AwardsModule,
  ],
  controllers: [LeadsController, NoticesController],
  providers: [
    OpportunitiesService,
    { provide: OPPORTUNITY_REPOSITORY, useClass: MikroOrmOpportunityRepository },
    { provide: BID_REPOSITORY, useClass: MikroOrmBidRepository },
  ],
  exports: [OpportunitiesService, OPPORTUNITY_REPOSITORY, BID_REPOSITORY],
})
export class OpportunitiesModule {}
