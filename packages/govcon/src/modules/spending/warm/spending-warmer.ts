import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  biddableSetAsides,
  WARM_TOP_AGENCIES,
  windowOf,
  type HorizonBody,
  type Provenance,
  type SearchProfile,
  type ServedFrom,
} from '@sysdesign/contracts';
import { ZodError } from 'zod';

import {
  awardEndingAlerts,
  pulseAboveBandAlerts,
  SPENDING_DIGEST,
} from '../../../core/alerts/spending';
import { topAgencyCodes } from '../../../core/spending/agency';
import type { ReadOptions } from '../../../core/spending/lens';
import { messageOf } from '../../../core/text';
import { AlertRaiser, NOTHING_RAISED, type RaiseReport } from '../../alerts/alert-raiser';
import { ServeJob, type Cadence } from '../../app/serve-job';
import { ProfilesService } from '../../profiles/profiles.service';
import { CLOCK } from '../../sources/tokens';
import {
  breakdownQuerySchema,
  horizonQuerySchema,
  pulseQuerySchema,
  reachQuerySchema,
} from '../spending-requests';
import { SpendingService } from '../spending.service';
import { SPENDING_WARM_POLICY } from '../tokens';
import { WatchedAwards, type WatchedReading } from './watched-awards';

/** What a scheduled warm asks of every lens: the source, inside the cache window. */
const RENEW: ReadOptions = { refresh: true };

export type WarmLensOutcome =
  | { lens: string; outcome: 'ok'; servedFrom: ServedFrom; requests: number; ms: number }
  | { lens: string; outcome: 'refused'; status: number | null; message: string };

export interface WarmReport {
  /** The default profile warmed, or null when the store has none. */
  profile: string | null;
  lenses: WarmLensOutcome[];
  alerts: RaiseReport;
}

const NOTHING_WATCHED: WatchedReading = { alerts: [], observations: [] };

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

/**
 * The daily warm: the default profile's scope through every lens — renewed
 * on schedule, read from the window at a start — so the client's first look
 * is a snapshot, the reach count taken for the lanes the profile may bid;
 * for each top agency the breakdown
 * names, the horizon narrowed to it — the scope a directory pick opens, and
 * the one whose walk reaches today where a wide scope's caps first — and its
 * outlook; then every tracked award's own record; then the alert rules over
 * the tracked awards, every horizon and the pulse, handed to the alert
 * raiser: each raised once per key and listed in one digest put to a person.
 * A job `serve()` starts, on the lifecycle every such job shares.
 */
@Injectable()
export class SpendingWarmer implements OnModuleDestroy {
  private readonly logger = new Logger(SpendingWarmer.name);
  private readonly job = new ServeJob('spending warm', this.logger);

  constructor(
    @Inject(SPENDING_WARM_POLICY) private readonly policy: Cadence,
    private readonly spending: SpendingService,
    private readonly profiles: ProfilesService,
    private readonly watched: WatchedAwards,
    private readonly alerts: AlertRaiser,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /**
   * On the declared cadence. The run at start brings every lens up to date
   * within the cache window — it reads what the window still holds, so a
   * restart inside the day spends no request — and every run on the cadence
   * renews. Measured 2026-10-13: four renewing warms in fourteen minutes,
   * one per restart, and the source's firewall refused this address.
   */
  start(): void {
    this.job.start(this.policy, (onCadence) => this.warm({ refresh: onCadence }));
  }

  stop(): Promise<void> {
    return this.job.stop();
  }

  onModuleDestroy(): Promise<void> {
    return this.job.destroy();
  }

  /** One warm — renewing unless told to read what the window holds. A lens the source or the schema refuses is one logged line; the rest still run. */
  async warm(options: ReadOptions = RENEW): Promise<WarmReport> {
    const profile = await this.defaultProfile();
    if (profile === null) {
      this.logger.warn('warm skipped: no default profile');
      return { profile: null, lenses: [], alerts: NOTHING_RAISED };
    }
    const lenses: WarmLensOutcome[] = [];
    const read = <T extends { provenance: Provenance }>(lens: string, load: () => Promise<T>) =>
      this.timed(lens, load, lenses);
    const wire = scopeWireOf(profile);

    const pulse = await read('pulse', () =>
      this.spending.pulse(pulseQuerySchema.parse(wire), options),
    );
    // A rolling year, as the page opens: the fiscal year to date is thirteen days long on October 13.
    const year = windowOf('last-12-months', this.now().getTime());
    const breakdown = await read('breakdown', () =>
      this.spending.breakdown(
        breakdownQuerySchema.parse({ ...wire, category: 'awarding_agency', ...year }),
        options,
      ),
    );
    await read('reach', () =>
      this.spending.reach(
        reachQuerySchema.parse({
          naics: wire.naics,
          psc: wire.psc,
          lanes: biddableSetAsides(profile.scoring.setAside),
          ...year,
        }),
        options,
      ),
    );
    const horizon = await read('horizon', () =>
      this.spending.horizon(horizonQuerySchema.parse(wire), options),
    );
    const agencies = await read('agencies', () => this.spending.agencies(options));
    const top =
      breakdown && agencies
        ? topAgencyCodes(breakdown.rows, agencies.entries, WARM_TOP_AGENCIES)
        : [];
    const horizons: HorizonBody[] = horizon ? [horizon] : [];
    for (const code of top) {
      const narrowed = await read(`horizon ${code}`, () =>
        this.spending.horizon(horizonQuerySchema.parse({ ...wire, agency: code }), options),
      );
      if (narrowed) horizons.push(narrowed);
      await read(`agency ${code}`, () =>
        this.spending.agency(code, { awardFamily: 'both' }, options),
      );
    }

    const tracked = await this.tracked(profile, options, read);
    // A tracked award's own record comes first, so it is the one kept when a scope lists the same award.
    const alerts = await this.alerts.raise(
      profile,
      [
        ...tracked.alerts,
        ...horizons.flatMap((body) => awardEndingAlerts(body, profile.alerts, profile.id)),
        ...(pulse ? pulseAboveBandAlerts(pulse, profile.alerts, profile.id) : []),
      ],
      SPENDING_DIGEST,
    );
    await this.settle(tracked);
    return { profile: profile.id, lenses, alerts };
  }

  /** The tracked awards read and ruled on; a target store that cannot be read is one logged line, and the scope's alerts still run. */
  private async tracked(
    profile: SearchProfile,
    options: ReadOptions,
    read: Parameters<WatchedAwards['read']>[2],
  ): Promise<WatchedReading> {
    try {
      return await this.watched.read(profile, options, read);
    } catch (error) {
      this.logger.warn(`tracked awards not read: ${messageOf(error)}`);
      return NOTHING_WATCHED;
    }
  }

  private async settle(tracked: WatchedReading): Promise<void> {
    try {
      await this.watched.settle(tracked.observations);
    } catch (error) {
      this.logger.warn(`tracked ends not written, compared again next warm: ${messageOf(error)}`);
    }
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
}
