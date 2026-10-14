import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconAlert } from '@sysdesign/db';
import { HttpBusClient } from '@sysdesign/notifications-client';

import { SourcesModule } from '../sources/sources.module';
import { AlertRaiser } from './alert-raiser';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { ALERT_BUS_RECOVERY, BusAlertSink, notificationsUrlFromEnv } from './bus-alert-sink';
import { MikroOrmAlertLedger } from './persistence/mikro-orm-alert-ledger';
import { ALERT_LEDGER, ALERT_SINK } from './tokens';

/**
 * Alerts: what a run found worth a person's attention, raised once per key —
 * ledgered here, published on the notifications bus with one digest a person
 * reads, and read back at `/alerts`. The rules that find alerts live with
 * whoever runs them; this module only raises and keeps them. The bus's
 * address is read from the environment here and nowhere below.
 */
@Module({
  imports: [MikroOrmModule.forFeature([GovconAlert]), SourcesModule],
  controllers: [AlertsController],
  providers: [
    AlertRaiser,
    AlertsService,
    { provide: ALERT_LEDGER, useClass: MikroOrmAlertLedger },
    {
      provide: ALERT_SINK,
      useFactory: () =>
        new BusAlertSink(
          new HttpBusClient(notificationsUrlFromEnv(process.env), { recovery: ALERT_BUS_RECOVERY }),
        ),
    },
  ],
  exports: [AlertRaiser, ALERT_LEDGER],
})
export class AlertsModule {}
