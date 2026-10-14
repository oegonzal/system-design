import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { alertKeyOf, type GovconAlert, type SearchProfile } from '@sysdesign/contracts';

import { alertPromptOf, byWeight, type DigestKind } from '../../core/alerts/digest';
import type { AlertLedger, AlertSink, RaisedAlert } from '../../core/ports';
import { messageOf } from '../../core/text';
import { CLOCK } from '../sources/tokens';
import { ALERT_LEDGER, ALERT_SINK } from './tokens';

export interface RaiseReport {
  /** Distinct alerts handed over. */
  found: number;
  /** Not raised before this run. */
  fresh: number;
  published: number;
  prompted: boolean;
}

export const NOTHING_RAISED: RaiseReport = { found: 0, fresh: 0, published: 0, prompted: false };

/** The scope an alert was found in, when it was found in one. */
const scopeKeyOf = (alert: GovconAlert): string | null =>
  'scopeKey' in alert.payload ? alert.payload.scopeKey : null;

/** One alert per key, the first kept — the same award found twice is one alert, and its finder chooses which by the order it hands them over. */
const uniqueByKey = (alerts: readonly GovconAlert[]): GovconAlert[] => {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = alertKeyOf(alert.key);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * What a run found, put to a person once. Of the alerts handed over, the
 * ones the ledger has not seen are published on their declared topics — the
 * weightiest first, the order the digest and the ledger keep — listed in one
 * digest prompt, and recorded only once published, so an alert the bus
 * refused is found again by the next run. Whoever finds alerts hands them
 * here with what its digest is called; nothing here knows which rules ran.
 * Nothing thrown by the ledger or the bus leaves this: a run is told what
 * was raised, never interrupted by it.
 */
@Injectable()
export class AlertRaiser {
  private readonly logger = new Logger(AlertRaiser.name);

  constructor(
    @Inject(ALERT_LEDGER) private readonly ledger: AlertLedger,
    @Inject(ALERT_SINK) private readonly sink: AlertSink,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async raise(
    profile: Pick<SearchProfile, 'id' | 'company'>,
    alerts: readonly GovconAlert[],
    kind: DigestKind,
  ): Promise<RaiseReport> {
    const found = uniqueByKey(alerts);
    if (found.length === 0) {
      this.logger.log(`${kind.many}: none`);
      return NOTHING_RAISED;
    }
    const fresh = (await this.unraised(found, kind)).sort(byWeight);
    const published: { alert: GovconAlert; seq: string }[] = [];
    for (const alert of fresh) {
      try {
        published.push({ alert, seq: (await this.sink.publish(alert)).seq });
      } catch (error) {
        this.logger.warn(`${kind.many} not published: ${messageOf(error)}`);
        break;
      }
    }
    const promptId = published.length > 0 ? await this.digest(profile, published, kind) : null;
    if (published.length > 0) await this.record(profile, published, promptId);
    const report = {
      found: found.length,
      fresh: fresh.length,
      published: published.length,
      prompted: promptId !== null,
    };
    this.logger.log(
      `${kind.many}: ${report.found} found, ${report.fresh} new, ${report.published} published, digest ${report.prompted ? 'sent' : 'not sent'}`,
    );
    return report;
  }

  /** The alerts the ledger has not seen; a ledger that cannot be read raises nothing this run, since raising twice is worse than raising late. */
  private async unraised(found: readonly GovconAlert[], kind: DigestKind): Promise<GovconAlert[]> {
    try {
      const raised = await this.ledger.raised(found.map((alert) => alert.key));
      return found.filter((alert) => !raised.has(alertKeyOf(alert.key)));
    } catch (error) {
      this.logger.warn(`alert ledger not read, no ${kind.many} raised: ${messageOf(error)}`);
      return [];
    }
  }

  private async digest(
    profile: Pick<SearchProfile, 'id' | 'company'>,
    published: readonly { alert: GovconAlert }[],
    kind: DigestKind,
  ): Promise<string | null> {
    const prompt = alertPromptOf({
      id: randomUUID(),
      profile,
      alerts: published.map((entry) => entry.alert),
      kind,
      now: this.now(),
    });
    try {
      await this.sink.prompt(prompt);
      return prompt.id;
    } catch (error) {
      this.logger.warn(`digest not sent: ${messageOf(error)}`);
      return null;
    }
  }

  private async record(
    profile: Pick<SearchProfile, 'id'>,
    published: readonly { alert: GovconAlert; seq: string }[],
    promptId: string | null,
  ): Promise<void> {
    const raisedAt = this.now();
    const rows: RaisedAlert[] = published.map(({ alert, seq }, position) => ({
      key: alert.key,
      scopeKey: scopeKeyOf(alert),
      payload: alert.payload,
      position,
      profileId: profile.id,
      raisedAt,
      eventSeq: seq,
      promptId,
    }));
    try {
      await this.ledger.record(rows);
    } catch (error) {
      this.logger.warn(`alerts not recorded, raised again next run: ${messageOf(error)}`);
    }
  }
}
