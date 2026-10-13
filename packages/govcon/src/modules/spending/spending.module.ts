import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconAlert, GovconSpendingSnapshot } from '@sysdesign/db';
import { HttpBusClient } from '@sysdesign/notifications-client';

import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { ALERT_BUS_RECOVERY, BusAlertSink, notificationsUrlFromEnv } from './alerts/bus-alert-sink';
import { MikroOrmAlertLedger } from './persistence/mikro-orm-alert-ledger';
import { MikroOrmSpendingSnapshotStore } from './persistence/mikro-orm-spending-snapshot-store';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';
import { ALERT_LEDGER, ALERT_SINK, SPENDING_SNAPSHOTS, SPENDING_WARM_POLICY } from './tokens';
import { SpendingWarmer } from './warm/spending-warmer';
import { spendingWarmPolicyFromEnv } from './warm/warm-policy';

/**
 * Spending research: the lenses over USAspending behind the gate, snapshotted
 * in Postgres, the horizon joined to the stored notices; the daily warm over
 * the default profile with its alerts ledgered here and put to a person
 * through the notifications bus. The warm's cadence and the bus's address
 * are read from the environment here and nowhere below.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([GovconSpendingSnapshot, GovconAlert]),
    SourcesModule,
    ProfilesModule,
    OpportunitiesModule,
  ],
  controllers: [SpendingController],
  providers: [
    SpendingService,
    SpendingWarmer,
    { provide: SPENDING_SNAPSHOTS, useClass: MikroOrmSpendingSnapshotStore },
    { provide: ALERT_LEDGER, useClass: MikroOrmAlertLedger },
    { provide: SPENDING_WARM_POLICY, useFactory: () => spendingWarmPolicyFromEnv(process.env) },
    {
      provide: ALERT_SINK,
      useFactory: () =>
        new BusAlertSink(
          new HttpBusClient(notificationsUrlFromEnv(process.env), { recovery: ALERT_BUS_RECOVERY }),
        ),
    },
  ],
})
export class SpendingModule {}
