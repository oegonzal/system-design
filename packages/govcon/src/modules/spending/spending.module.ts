import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconSpendingSnapshot } from '@sysdesign/db';

import { AlertsModule } from '../alerts/alerts.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { TargetsModule } from '../targets/targets.module';
import { MikroOrmSpendingSnapshotStore } from './persistence/mikro-orm-spending-snapshot-store';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';
import { SPENDING_SNAPSHOTS, SPENDING_WARM_POLICY } from './tokens';
import { SpendingWarmer } from './warm/spending-warmer';
import { spendingWarmPolicyFromEnv } from './warm/warm-policy';
import { WatchedAwards } from './warm/watched-awards';

/**
 * Spending research: the lenses over USAspending behind the gate, snapshotted
 * in Postgres, the horizon joined to the stored notices; and the daily warm
 * over the default profile and the tracked awards, whose findings go to the
 * alerts module. The warm's cadence is read from the environment here and
 * nowhere below.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([GovconSpendingSnapshot]),
    SourcesModule,
    ProfilesModule,
    OpportunitiesModule,
    TargetsModule,
    AlertsModule,
  ],
  controllers: [SpendingController],
  providers: [
    SpendingService,
    SpendingWarmer,
    WatchedAwards,
    { provide: SPENDING_SNAPSHOTS, useClass: MikroOrmSpendingSnapshotStore },
    { provide: SPENDING_WARM_POLICY, useFactory: () => spendingWarmPolicyFromEnv(process.env) },
  ],
  exports: [SpendingService],
})
export class SpendingModule {}
