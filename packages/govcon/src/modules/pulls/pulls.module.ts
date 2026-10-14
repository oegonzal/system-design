import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { pullScheduleFromEnv } from './pull-schedule';
import { PullScheduler } from './pull-scheduler';
import { PullService } from './pull.service';
import { PullsController, SearchRunsController } from './pulls.controller';
import { PULL_SCHEDULE } from './tokens';

/**
 * What spends the search budget: the daily pull — asked for, or on its
 * schedule under `serve`, with the leads it is worth telling a person about
 * handed to the alerts module — a saved search run, a filter run. The
 * schedule is read from the environment here and nowhere below.
 */
@Module({
  imports: [SourcesModule, ProfilesModule, OpportunitiesModule, AlertsModule],
  controllers: [PullsController, SearchRunsController],
  providers: [
    PullService,
    PullScheduler,
    { provide: PULL_SCHEDULE, useFactory: () => pullScheduleFromEnv(process.env) },
  ],
  exports: [PullService],
})
export class PullsModule {}
