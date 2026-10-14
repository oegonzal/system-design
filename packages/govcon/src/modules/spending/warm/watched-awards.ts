import { Inject, Injectable } from '@nestjs/common';
import {
  alertKeyOf,
  isoDateOf,
  MAX_WATCHED_AWARDS,
  type AlertKey,
  type GovconAlert,
  type Provenance,
  type SearchProfile,
} from '@sysdesign/contracts';

import type { AlertLedger, TargetKey, TargetRepository } from '../../../core/ports';
import { watchedAwardAlerts } from '../../../core/alerts/spending';
import type { ReadOptions } from '../../../core/spending/lens';
import { watchedAwards } from '../../../core/targets';
import { ALERT_LEDGER } from '../../alerts/tokens';
import { CLOCK } from '../../sources/tokens';
import { TARGET_REPOSITORY } from '../../targets/tokens';
import { SpendingService } from '../spending.service';

/** What a warm read of one tracked award's end, and the alert that says it moved when it did. */
export interface EndObservation {
  key: TargetKey;
  endsAt: string | null;
  moved: AlertKey | null;
}

export interface WatchedReading {
  alerts: GovconAlert[];
  observations: EndObservation[];
}

/** How a warm reads one lens: timed and logged, null when the read was refused. */
export type WarmRead = <T extends { provenance: Provenance }>(
  lens: string,
  load: () => Promise<T>,
) => Promise<T | null>;

/**
 * The tracked awards as a warm reads them: each one's own record through the
 * award lens — kept for the day, so a restart spends nothing — and the alert
 * rules over it. A bounded number are read, the ones never read first and
 * then the soonest to end.
 *
 * What was read of an award's end is written back to its target only once
 * the alert that says it moved is on the ledger. The comparison is against
 * the end last written, so an alert the bus refused is found again by the
 * next warm instead of being lost to a comparison that had already moved on.
 */
@Injectable()
export class WatchedAwards {
  constructor(
    private readonly spending: SpendingService,
    @Inject(TARGET_REPOSITORY) private readonly targets: TargetRepository,
    @Inject(ALERT_LEDGER) private readonly ledger: AlertLedger,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async read(
    profile: SearchProfile,
    options: ReadOptions,
    read: WarmRead,
  ): Promise<WatchedReading> {
    const today = isoDateOf(this.now().getTime());
    const reading: WatchedReading = { alerts: [], observations: [] };
    for (const target of watchedAwards(await this.targets.listAll(), MAX_WATCHED_AWARDS)) {
      const award = await read(`award ${target.subject}`, () =>
        this.spending.award(target.subject, options),
      );
      if (award === null) continue;
      const alerts = watchedAwardAlerts(
        { lastEndsAt: target.endsAt, award, openNotices: award.openNotices },
        profile.alerts,
        profile.id,
        today,
      );
      reading.alerts.push(...alerts);
      if (award.endsAt !== target.endsAt) {
        reading.observations.push({
          key: { kind: target.kind, subject: target.subject },
          endsAt: award.endsAt,
          moved: alerts.find((alert) => alert.key.kind === 'award-end-moved')?.key ?? null,
        });
      }
    }
    return reading;
  }

  /** Once the alerts were raised: each end read is written back, unless the alert for its move is not on the ledger. */
  async settle(observations: readonly EndObservation[]): Promise<void> {
    if (observations.length === 0) return;
    const raised = await this.ledger.raised(
      observations.flatMap((observation) =>
        observation.moved === null ? [] : [observation.moved],
      ),
    );
    for (const { key, endsAt, moved } of observations) {
      if (moved !== null && !raised.has(alertKeyOf(moved))) continue;
      await this.targets.observe(key, endsAt);
    }
  }
}
