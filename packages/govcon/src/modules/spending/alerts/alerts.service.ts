import { Inject, Injectable } from '@nestjs/common';
import { ALERT_DECLARATIONS, type RaisedAlertView } from '@sysdesign/contracts';

import type { AlertLedger } from '../../../core/ports';
import { ALERT_LEDGER } from '../tokens';

/**
 * The alerts the warm raised, read back for a person: newest first, each as
 * the alert that was published. A stored payload its kind's schema refuses
 * reads as no alert — refused, never trusted — and so does a row from
 * before payloads were kept; the key still says what it was about.
 */
@Injectable()
export class AlertsService {
  constructor(@Inject(ALERT_LEDGER) private readonly ledger: AlertLedger) {}

  async list(page: { limit: number; offset: number }): Promise<[RaisedAlertView[], number]> {
    const [rows, total] = await this.ledger.list(page);
    return [
      rows.map((row) => ({
        id: row.id,
        key: row.key,
        profileId: row.profileId,
        raisedAt: row.raisedAt.toISOString(),
        alert: ALERT_DECLARATIONS[row.key.kind].read(row.key, row.payload),
      })),
      total,
    ];
  }
}
