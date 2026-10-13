import { randomUUID } from 'node:crypto';

import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  alertKeyOf,
  startPeriodic,
  WARM_TOP_AGENCIES,
  windowOf,
  type GovconAlert,
  type HorizonBody,
  type Periodic,
  type Provenance,
  type SearchProfile,
  type ServedFrom,
} from '@sysdesign/contracts';
import { ZodError } from 'zod';

import type { AlertLedger, AlertSink, RaisedAlert } from '../../../core/ports';
import { topAgencyCodes } from '../../../core/spending/agency';
import {
  alertPromptOf,
  awardEndingAlerts,
  pulseAboveBandAlerts,
} from '../../../core/spending/alerts';
import { messageOf } from '../../../core/text';
import { ProfilesService } from '../../profiles/profiles.service';
import { CLOCK } from '../../sources/tokens';
import { breakdownQuerySchema, horizonQuerySchema, pulseQuerySchema } from '../spending-requests';
import { SpendingService } from '../spending.service';
import { ALERT_LEDGER, ALERT_SINK, SPENDING_WARM_POLICY } from '../tokens';
import type { SpendingWarmPolicy } from './warm-policy';

const REFRESH = { refresh: true } as const;
const HOUR_MS = 60 * 60 * 1000;

export type WarmLensOutcome =
  | { lens: string; outcome: 'ok'; servedFrom: ServedFrom; requests: number; ms: number }
  | { lens: string; outcome: 'refused'; status: number | null; message: string };

export interface WarmAlerts {
  found: number;
  /** Not raised before this warm. */
  fresh: number;
  published: number;
  prompted: boolean;
}

export interface WarmReport {
  /** The default profile warmed, or null when the store has none. */
  profile: string | null;
  lenses: WarmLensOutcome[];
  alerts: WarmAlerts;
}

const NO_ALERTS: WarmAlerts = { found: 0, fresh: 0, published: 0, prompted: false };

/** The scope the warm reads — what the client opens on: the profile's NAICS, no PSC (the source ANDs the two, so PSC only narrows), every agency, both families. */
const scopeWireOf = (profile: SearchProfile) => ({
  naics: profile.naics,
  psc: [],
  awardFamily: 'both' as const,
});

/** A refusal as one line: the HTTP answer the service gives, a scope the request schema refuses, or whatever else was thrown. */
const refusalOf = (error: unknown): { status: number | null; message: string } => {
  if (error instanceof HttpException) return { status: error.getStatus(), message: error.message };
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return {
      status: 400,
      message: issue ? `${issue.path.map(String).join('.')} ${issue.message}` : 'invalid scope',
    };
  }
  return { status: null, message: messageOf(error) };
};

/** One alert per key, the first kept — the same award through two scopes is one alert. */
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
 * The daily warm: the default profile's scope through every lens, forced, so
 * the client's first look is a snapshot; for each top agency the breakdown
 * names, the horizon narrowed to it — the scope a directory pick opens, and
 * the one whose walk reaches today where a wide scope's caps first — and its
 * outlook; then the alert rules over every horizon and the pulse, each alert
 * raised once per key, published on its topic, and listed in one digest put
 * to a person. Started by `serve()` alone — a lifecycle hook would also run under
 * the CLI and the HTTP suite — and stopped before the store closes.
 */
@Injectable()
export class SpendingWarmer implements OnModuleDestroy {
  private readonly logger = new Logger(SpendingWarmer.name);
  private periodic: Periodic | null = null;

  constructor(
    @Inject(SPENDING_WARM_POLICY) private readonly policy: SpendingWarmPolicy,
    private readonly spending: SpendingService,
    private readonly profiles: ProfilesService,
    @Inject(ALERT_LEDGER) private readonly ledger: AlertLedger,
    @Inject(ALERT_SINK) private readonly sink: AlertSink,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** On the declared cadence, the first warm at once; starting twice starts once. */
  start(): void {
    if (this.periodic !== null) return;
    this.logger.log(
      this.policy.everyMs === null
        ? 'spending warm off'
        : `spending warm every ${this.policy.everyMs / HOUR_MS} h`,
    );
    this.periodic = startPeriodic(
      { everyMs: this.policy.everyMs, atStart: true },
      () => this.warm(),
      (error) => this.logger.error(`warm failed: ${messageOf(error)}`),
    );
  }

  /** Safe before start; a warm in flight finishes first, so nothing it holds outlives the store. */
  async stop(): Promise<void> {
    await this.periodic?.stop();
    this.periodic = null;
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  /** One warm. A lens the source or the schema refuses is one logged line; the rest still run. */
  async warm(): Promise<WarmReport> {
    const profile = await this.defaultProfile();
    if (profile === null) {
      this.logger.warn('warm skipped: no default profile');
      return { profile: null, lenses: [], alerts: NO_ALERTS };
    }
    const lenses: WarmLensOutcome[] = [];
    const read = <T extends { provenance: Provenance }>(lens: string, load: () => Promise<T>) =>
      this.timed(lens, load, lenses);
    const wire = scopeWireOf(profile);

    const pulse = await read('pulse', () =>
      this.spending.pulse(pulseQuerySchema.parse(wire), REFRESH),
    );
    // A rolling year, as the page opens: the fiscal year to date is thirteen days long on October 13.
    const breakdown = await read('breakdown', () =>
      this.spending.breakdown(
        breakdownQuerySchema.parse({
          ...wire,
          category: 'awarding_agency',
          ...windowOf('last-12-months', this.now().getTime()),
        }),
        REFRESH,
      ),
    );
    const horizon = await read('horizon', () =>
      this.spending.horizon(horizonQuerySchema.parse(wire), REFRESH),
    );
    const agencies = await read('agencies', () => this.spending.agencies(REFRESH));
    const top =
      breakdown && agencies
        ? topAgencyCodes(breakdown.rows, agencies.entries, WARM_TOP_AGENCIES)
        : [];
    const horizons: HorizonBody[] = horizon ? [horizon] : [];
    for (const code of top) {
      const narrowed = await read(`horizon ${code}`, () =>
        this.spending.horizon(horizonQuerySchema.parse({ ...wire, agency: code }), REFRESH),
      );
      if (narrowed) horizons.push(narrowed);
      await read(`agency ${code}`, () =>
        this.spending.agency(code, { awardFamily: 'both' }, REFRESH),
      );
    }

    const found = uniqueByKey([
      ...horizons.flatMap((body) => awardEndingAlerts(body, profile.alerts, profile.id)),
      ...(pulse ? pulseAboveBandAlerts(pulse, profile.alerts, profile.id) : []),
    ]);
    return { profile: profile.id, lenses, alerts: await this.raise(profile, found) };
  }

  private async defaultProfile(): Promise<SearchProfile | null> {
    try {
      return await this.profiles.resolve(undefined);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  private async timed<T extends { provenance: Provenance }>(
    lens: string,
    load: () => Promise<T>,
    outcomes: WarmLensOutcome[],
  ): Promise<T | null> {
    const startedAt = this.now().getTime();
    try {
      const answer = await load();
      const { servedFrom, requests } = answer.provenance;
      const ms = this.now().getTime() - startedAt;
      outcomes.push({ lens, outcome: 'ok', servedFrom, requests, ms });
      this.logger.log(`warm ${lens} ${servedFrom} ${requests} req ${ms} ms`);
      return answer;
    } catch (error) {
      const refusal = refusalOf(error);
      outcomes.push({ lens, outcome: 'refused', ...refusal });
      this.logger.warn(`warm ${lens} refused ${refusal.status ?? '?'} ${refusal.message}`);
      return null;
    }
  }

  /** What was not raised before, published in order; one digest for what was; recorded only once published. */
  private async raise(profile: SearchProfile, found: readonly GovconAlert[]): Promise<WarmAlerts> {
    if (found.length === 0) {
      this.logger.log('warm alerts: none');
      return NO_ALERTS;
    }
    const fresh = await this.unraised(found);
    const published: { alert: GovconAlert; seq: string }[] = [];
    for (const alert of fresh) {
      try {
        published.push({ alert, seq: (await this.sink.publish(alert)).seq });
      } catch (error) {
        this.logger.warn(`alerts not published: ${messageOf(error)}`);
        break;
      }
    }
    const promptId = published.length > 0 ? await this.digest(profile, published) : null;
    if (published.length > 0) await this.record(profile, published, promptId);
    const report = {
      found: found.length,
      fresh: fresh.length,
      published: published.length,
      prompted: promptId !== null,
    };
    this.logger.log(
      `warm alerts: ${report.found} found, ${report.fresh} new, ${report.published} published, digest ${report.prompted ? 'sent' : 'not sent'}`,
    );
    return report;
  }

  /** The alerts the ledger has not seen; a ledger that cannot be read raises nothing this warm, since raising twice is worse than raising late. */
  private async unraised(found: readonly GovconAlert[]): Promise<GovconAlert[]> {
    try {
      const raised = await this.ledger.raised(found.map((alert) => alert.key));
      return found.filter((alert) => !raised.has(alertKeyOf(alert.key)));
    } catch (error) {
      this.logger.warn(`alert ledger not read, nothing raised this warm: ${messageOf(error)}`);
      return [];
    }
  }

  private async digest(
    profile: SearchProfile,
    published: readonly { alert: GovconAlert }[],
  ): Promise<string | null> {
    const prompt = alertPromptOf({
      id: randomUUID(),
      profile,
      alerts: published.map((entry) => entry.alert),
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
    profile: SearchProfile,
    published: readonly { alert: GovconAlert; seq: string }[],
    promptId: string | null,
  ): Promise<void> {
    const raisedAt = this.now();
    const rows: RaisedAlert[] = published.map(({ alert, seq }) => ({
      key: alert.key,
      scopeKey: alert.payload.scopeKey,
      profileId: profile.id,
      raisedAt,
      eventSeq: seq,
      promptId,
    }));
    try {
      await this.ledger.record(rows);
    } catch (error) {
      this.logger.warn(`alerts not recorded, raised again next warm: ${messageOf(error)}`);
    }
  }
}
