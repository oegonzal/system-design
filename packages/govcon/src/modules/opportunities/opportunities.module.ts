import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconOpportunity } from '@sysdesign/db';

import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { LeadsController } from './leads.controller';
import { NoticesController } from './notices.controller';
import { OpportunitiesService } from './opportunities.service';
import { MikroOrmOpportunityRepository } from './persistence/mikro-orm-opportunity-repository';
import { OPPORTUNITY_REPOSITORY } from './tokens';

/** The stored notices: the repository, the ranking and the description on demand. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconOpportunity]), SourcesModule, ProfilesModule],
  controllers: [LeadsController, NoticesController],
  providers: [
    OpportunitiesService,
    { provide: OPPORTUNITY_REPOSITORY, useClass: MikroOrmOpportunityRepository },
  ],
  exports: [OpportunitiesService, OPPORTUNITY_REPOSITORY],
})
export class OpportunitiesModule {}
