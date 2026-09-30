import { Module } from '@nestjs/common';

import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { BidsController, PipelineController } from './bids.controller';
import { BidsService } from './bids.service';

/** The bid pipeline over the stored notices. */
@Module({
  imports: [SourcesModule, ProfilesModule, OpportunitiesModule],
  controllers: [BidsController, PipelineController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
