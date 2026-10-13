import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconSpendingSnapshot } from '@sysdesign/db';

import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SourcesModule } from '../sources/sources.module';
import { MikroOrmSpendingSnapshotStore } from './persistence/mikro-orm-spending-snapshot-store';
import { SpendingController } from './spending.controller';
import { SpendingService } from './spending.service';
import { SPENDING_SNAPSHOTS } from './tokens';

/** Spending research: the lenses over USAspending behind the gate, snapshotted in Postgres, the horizon joined to the stored notices. */
@Module({
  imports: [
    MikroOrmModule.forFeature([GovconSpendingSnapshot]),
    SourcesModule,
    OpportunitiesModule,
  ],
  controllers: [SpendingController],
  providers: [
    SpendingService,
    { provide: SPENDING_SNAPSHOTS, useClass: MikroOrmSpendingSnapshotStore },
  ],
})
export class SpendingModule {}
