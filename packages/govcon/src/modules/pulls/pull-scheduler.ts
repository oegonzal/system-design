import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PullReport, SearchProfile } from '@sysdesign/contracts';

import { LEADS_DIGEST, newLeadAlerts } from '../../core/alerts/leads';
import type { OpportunitySearch } from '../../core/ports';
import { messageOf } from '../../core/text';
import { AlertRaiser, NOTHING_RAISED, type RaiseReport } from '../alerts/alert-raiser';
import { ServeJob, type Cadence } from '../app/serve-job';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ProfilesService } from '../profiles/profiles.service';
import { OPPORTUNITY_SEARCH } from '../sources/tokens';
import { PullService } from './pull.service';
import { PULL_SCHEDULE } from './tokens';

export interface ScheduledPull {
  /** The default profile pulled, or null when the store has none. */
  profile: string | null;
  /** The pull's own report; null when the pull could not run. */
  report: PullReport | null;
  alerts: RaiseReport;
}

/** A pull's report in one line, for the log nobody is watching live. */
const summaryOf = (report: PullReport): string => {
  const byOutcome = new Map<string, number>();
  for (const slice of report.slices) {
    byOutcome.set(slice.outcome, (byOutcome.get(slice.outcome) ?? 0) + 1);
  }
  const outcomes = [...byOutcome].map(([outcome, count]) => `${count} ${outcome}`).join(', ');
  const stored = report.slices.reduce((total, slice) => total + slice.inserted, 0);
  const stopped = report.stoppedBy === null ? '' : `, stopped by ${report.stoppedBy}`;
  return `${report.window.from}..${report.window.to}: ${outcomes || 'no saved search is flagged for the pull'}, ${stored} new notice(s)${stopped}`;
};

/**
 * The daily pull on a schedule, and what it is worth telling a person. Each
 * run is the default profile's pull exactly as `POST /pulls` runs it —
 * through the gate, so the budget bounds it, and a search already pulled
 * inside the cache window answers `cached`: a restart inside the day spends
 * no request. Then the lead rule over the store: every notice the profile
 * ranks in the tier it asks to hear about goes to the alert raiser, which
 * raises each once. The rule reads the store and not the pull's report, so
 * a lead a refused bus kept from being raised is found again by the next
 * run, and so is one a pull made by hand brought in. A source that is
 * disabled is not pulled at all. A job `serve()` starts, on the lifecycle
 * every such job shares.
 */
@Injectable()
export class PullScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(PullScheduler.name);
  private readonly job = new ServeJob('scheduled pull', this.logger);

  constructor(
    @Inject(PULL_SCHEDULE) private readonly schedule: Cadence,
    @Inject(OPPORTUNITY_SEARCH)
    private readonly source: Pick<OpportunitySearch, 'id' | 'availability'>,
    private readonly pulls: PullService,
    private readonly opportunities: OpportunitiesService,
    private readonly profiles: ProfilesService,
    private readonly alerts: AlertRaiser,
  ) {}

  start(): void {
    this.job.start(this.schedule, () => this.run());
  }

  stop(): Promise<void> {
    return this.job.stop();
  }

  onModuleDestroy(): Promise<void> {
    return this.job.destroy();
  }

  /** One run: the pull, then the lead rule. A pull that does not run — its source disabled, or a failure — is one line, and the rule still runs over what is stored. */
  async run(): Promise<ScheduledPull> {
    const profile = await this.profiles.defaultOrNull();
    if (profile === null) {
      this.logger.warn('scheduled pull skipped: no default profile');
      return { profile: null, report: null, alerts: NOTHING_RAISED };
    }
    const report = await this.pull(profile);
    const { leads } = await this.opportunities.ranked(profile);
    const alerts = await this.alerts.raise(
      profile,
      newLeadAlerts(leads, profile.alerts, profile.id),
      LEADS_DIGEST,
    );
    return { profile: profile.id, report, alerts };
  }

  private async pull(profile: SearchProfile): Promise<PullReport | null> {
    const { enabled, reason } = this.source.availability;
    if (!enabled) {
      this.logger.warn(`scheduled pull skipped: ${this.source.id} is disabled (${reason})`);
      return null;
    }
    try {
      const report = await this.pulls.pull(profile.id, {});
      this.logger.log(`scheduled pull ${summaryOf(report)}`);
      return report;
    } catch (error) {
      this.logger.warn(`scheduled pull not run: ${messageOf(error)}`);
      return null;
    }
  }
}
