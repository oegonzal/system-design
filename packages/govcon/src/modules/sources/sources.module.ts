import { Logger, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconSourceCall } from '@sysdesign/db';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { SourceCallLog } from '../../core/ports';
import { MikroOrmSourceCallLog } from './persistence/mikro-orm-source-call-log';
import { budgetPolicyFromEnv, createSamGovSources } from './sam-gov/create-sources';
import { createUsaSpendingSources } from './usaspending/create-sources';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';
import {
  BUDGET_POLICY,
  CLOCK,
  CONTRACT_AWARDS,
  ENTITY_REGISTRY,
  NOTICE_DESCRIPTIONS,
  OPPORTUNITY_SEARCH,
  REQUEST_GATE,
  SOURCE_CALL_LOG,
  SPENDING_AWARDS,
} from './tokens';

const logger = new Logger('Govcon');
const warn = (message: string): void => logger.warn(message);

/** The environment is read once, here, and nowhere below. */
const sources = createSamGovSources(process.env, { warn });
const spending = createUsaSpendingSources(process.env, { warn });

/**
 * The upstream side: the SAM.gov adapters behind the request gate over the
 * Postgres ledger, the budget as data, and the one clock every module
 * shares. Everything that spends a request is wired here and exported.
 */
@Module({
  imports: [MikroOrmModule.forFeature([GovconSourceCall])],
  controllers: [SourceController],
  providers: [
    SourceService,
    { provide: SOURCE_CALL_LOG, useClass: MikroOrmSourceCallLog },
    { provide: CLOCK, useValue: () => new Date() },
    { provide: BUDGET_POLICY, useFactory: () => budgetPolicyFromEnv(process.env) },
    { provide: OPPORTUNITY_SEARCH, useValue: sources.search },
    { provide: NOTICE_DESCRIPTIONS, useValue: sources.descriptions },
    { provide: CONTRACT_AWARDS, useValue: sources.awards },
    { provide: SPENDING_AWARDS, useValue: spending.awards },
    { provide: ENTITY_REGISTRY, useValue: sources.entities },
    {
      provide: REQUEST_GATE,
      useFactory: (log: SourceCallLog, policy: BudgetPolicy, now: () => Date) =>
        new RequestGate(log, policy, now, warn),
      inject: [SOURCE_CALL_LOG, BUDGET_POLICY, CLOCK],
    },
  ],
  exports: [
    SourceService,
    SOURCE_CALL_LOG,
    CLOCK,
    BUDGET_POLICY,
    OPPORTUNITY_SEARCH,
    NOTICE_DESCRIPTIONS,
    CONTRACT_AWARDS,
    SPENDING_AWARDS,
    ENTITY_REGISTRY,
    REQUEST_GATE,
  ],
})
export class SourcesModule {}
