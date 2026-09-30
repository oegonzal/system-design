import { Logger, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconOpportunity, GovconSourceCall } from '@sysdesign/db';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { SourceCallLog } from '../../core/ports';
import { PROFILES } from '../../profiles';
import { budgetPolicyFromEnv, createSamGovSources } from '../sources/sam-gov/create-sources';
import { LeadsController } from './leads.controller';
import { NoticesController } from './notices.controller';
import { OpportunitiesService } from './opportunities.service';
import { MikroOrmOpportunityRepository } from './persistence/mikro-orm-opportunity-repository';
import { MikroOrmSourceCallLog } from './persistence/mikro-orm-source-call-log';
import { ProfilesController } from './profiles.controller';
import { PullsController } from './pulls.controller';
import { SourceController } from './source.controller';
import {
  BUDGET_POLICY,
  CLOCK,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_REPOSITORY,
  OPPORTUNITY_SEARCH,
  REQUEST_GATE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

const logger = new Logger('Govcon');
const warn = (message: string): void => logger.warn(message);

/** The environment is read once, here, and nowhere below. */
const sources = createSamGovSources(process.env, { warn });

/**
 * The composition root: the SAM.gov adapters behind the request gate over
 * the Postgres ledger, the Postgres repository, the profile registry and a
 * real clock.
 */
@Module({
  imports: [MikroOrmModule.forFeature([GovconOpportunity, GovconSourceCall])],
  controllers: [
    ProfilesController,
    SourceController,
    PullsController,
    LeadsController,
    NoticesController,
  ],
  providers: [
    OpportunitiesService,
    { provide: SOURCE_CALL_LOG, useClass: MikroOrmSourceCallLog },
    { provide: OPPORTUNITY_REPOSITORY, useClass: MikroOrmOpportunityRepository },
    { provide: SEARCH_PROFILES, useValue: PROFILES },
    { provide: CLOCK, useValue: () => new Date() },
    { provide: BUDGET_POLICY, useFactory: () => budgetPolicyFromEnv(process.env) },
    { provide: OPPORTUNITY_SEARCH, useValue: sources.search },
    { provide: NOTICE_DESCRIPTIONS, useValue: sources.descriptions },
    {
      provide: REQUEST_GATE,
      useFactory: (log: SourceCallLog, policy: BudgetPolicy, now: () => Date) =>
        new RequestGate(log, policy, now, warn),
      inject: [SOURCE_CALL_LOG, BUDGET_POLICY, CLOCK],
    },
  ],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
