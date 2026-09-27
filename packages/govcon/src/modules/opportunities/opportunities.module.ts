import { Logger, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconOpportunity, GovconSourceCall } from '@sysdesign/db';

import { BudgetedSource, type BudgetPolicy } from '../../core/budgeted-source';
import type { SourceCallLog } from '../../core/ports';
import { PROFILES } from '../../profiles';
import { OpportunitiesService } from './opportunities.service';
import { MikroOrmOpportunityRepository } from './persistence/mikro-orm-opportunity-repository';
import { MikroOrmSourceCallLog } from './persistence/mikro-orm-source-call-log';
import { createSamGovSourceFromEnv, samGovSettingsFromEnv } from './sam-gov/create-source';
import {
  BUDGET_POLICY,
  CLOCK,
  OPPORTUNITY_REPOSITORY,
  OPPORTUNITY_SOURCE,
  SEARCH_PROFILES,
  SOURCE_CALL_LOG,
} from './tokens';

const logger = new Logger('Govcon');
const warn = (message: string): void => logger.warn(message);

/** The budget alone — the key stays inside the source factory. */
const budgetPolicy = (): BudgetPolicy => {
  const { dailyBudget, ttlMs } = samGovSettingsFromEnv();
  return { dailyBudget, ttlMs };
};

/**
 * The composition root: SAM.gov behind the budgeted decorator over the
 * Postgres ledger, the Postgres repository, the profile registry and a real
 * clock. The environment is read once here (through the source factory) and
 * nowhere below.
 */
@Module({
  imports: [MikroOrmModule.forFeature([GovconOpportunity, GovconSourceCall])],
  providers: [
    OpportunitiesService,
    { provide: SOURCE_CALL_LOG, useClass: MikroOrmSourceCallLog },
    { provide: OPPORTUNITY_REPOSITORY, useClass: MikroOrmOpportunityRepository },
    { provide: SEARCH_PROFILES, useValue: PROFILES },
    { provide: CLOCK, useValue: () => new Date() },
    { provide: BUDGET_POLICY, useFactory: budgetPolicy },
    {
      provide: OPPORTUNITY_SOURCE,
      useFactory: (log: SourceCallLog, policy: BudgetPolicy, now: () => Date) =>
        new BudgetedSource(
          createSamGovSourceFromEnv(process.env, { warn }),
          log,
          policy,
          now,
          warn,
        ),
      inject: [SOURCE_CALL_LOG, BUDGET_POLICY, CLOCK],
    },
  ],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
