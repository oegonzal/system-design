import { Module } from '@nestjs/common';

import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { PullService } from './pull.service';
import { PullsController, SearchRunsController } from './pulls.controller';

/** What spends the search budget: the daily pull, a saved search run, a filter run. */
@Module({
  imports: [SourcesModule, ProfilesModule, OpportunitiesModule],
  controllers: [PullsController, SearchRunsController],
  providers: [PullService],
  exports: [PullService],
})
export class PullsModule {}
