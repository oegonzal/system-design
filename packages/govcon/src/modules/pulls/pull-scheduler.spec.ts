import { DEFAULT_ALERT_POLICY, type Opportunity } from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../core/budget';
import type { SearchPage } from '../../core/ports';
import {
  InMemoryAlertLedger,
  InMemoryAwardRepository,
  InMemoryBidRepository,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  okPage,
  opportunityOf,
  RecordingAlertSink,
  scriptedDescriptions,
  scriptedSearch,
  tinyProfile,
  tinySearches,
  type Scripted,
} from '../../core/testing';
import { AlertRaiser } from '../alerts/alert-raiser';
import type { Cadence } from '../app/serve-job';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchesService } from '../profiles/searches.service';
import { PullScheduler } from './pull-scheduler';
import { PullService } from './pull.service';

const NOW = new Date('2026-09-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** Ranked by the tiny profile at `NOW`: `best` 92.5 high, `mid` 52.5 medium. */
const BEST = opportunityOf({ noticeId: 'best' });
const MID: Opportunity = opportunityOf({
  noticeId: 'mid',
  naicsCode: '541512',
  naicsCodes: ['541512'],
  classificationCode: null,
  setAsideCode: null,
  title: 'Help desk',
});

interface Options {
  replies?: readonly Scripted<SearchPage>[];
  schedule?: Cadence;
  /** The profile stored as the default; null stores none. */
  profile?: ReturnType<typeof tinyProfile> | null;
  ttlMs?: number;
  /** False builds a source with no key. */
  enabled?: boolean;
}

async function harness({
  replies = [okPage([BEST]), okPage([MID])],
  schedule = { everyMs: null },
  profile = tinyProfile(),
  ttlMs = DAY,
  enabled = true,
}: Options = {}) {
  let now = NOW;
  const clock = () => now;
  const search = scriptedSearch('sam.gov', replies, enabled);
  const log = new InMemorySourceCallLog();
  const repository = new InMemoryOpportunityRepository();
  const profileRepository = new InMemoryProfileRepository();
  const searchRepository = new InMemorySavedSearchRepository();
  const policy: BudgetPolicy = {
    ttlMs,
    pullDeadlineMs: 120_000,
    buckets: { 'sam.gov': { dailyBudget: 10 } },
  };
  if (profile !== null) {
    await profileRepository.insert(profile, true, NOW);
    for (const saved of tinySearches(profile.id)) {
      await searchRepository.insert(profile.id, saved, NOW);
    }
  }
  const gate = new RequestGate(log, policy, clock);
  const profiles = new ProfilesService(profileRepository, searchRepository, clock);
  const pulls = new PullService(
    search,
    repository,
    searchRepository,
    policy,
    gate,
    profiles,
    new SearchesService(searchRepository, profiles, clock),
    clock,
  );
  const opportunities = new OpportunitiesService(
    repository,
    new InMemoryBidRepository(repository),
    new InMemoryAwardRepository(),
    scriptedDescriptions('sam.gov'),
    gate,
    profiles,
    clock,
  );
  const ledger = new InMemoryAlertLedger();
  const sink = new RecordingAlertSink();
  const scheduler = new PullScheduler(
    schedule,
    search,
    pulls,
    opportunities,
    profiles,
    new AlertRaiser(ledger, sink, clock),
  );
  return {
    scheduler,
    pulls,
    search,
    repository,
    ledger,
    sink,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('the scheduled pull', () => {
  it('[GOV-35] [GOV-36] a run is the default profile’s pull as it is asked for by hand — every flagged search through the gate — and then every stored notice the profile ranks in its policy’s tier is raised once, in a digest of its own; a run inside the cache window asks the source nothing and raises nothing again', async () => {
    const { scheduler, search, repository, sink, ledger, advance } = await harness();
    const first = await scheduler.run();
    expect(first.profile).toBe('tiny');
    expect(
      first.report?.slices.map((slice) => [slice.name, slice.outcome, slice.inserted]),
    ).toEqual([
      ['Machine shops', 'ok', 1],
      ['Computer services', 'ok', 1],
    ]);
    // The last three days, as a pull asked for with no window reads.
    expect(first.report?.window).toEqual({ from: '2026-09-23', to: '2026-09-26' });
    expect(repository.rows.size).toBe(2);
    expect(first.alerts).toEqual({ found: 1, fresh: 1, published: 1, prompted: true });
    expect(sink.published.map((alert) => [alert.topic, alert.key.subject])).toEqual([
      ['govcon.lead.new', 'best'],
    ]);
    expect(sink.prompts.map((prompt) => [prompt.title, prompt.origin.kind])).toEqual([
      ['1 new lead for Tiny LLC', 'govcon.leads'],
    ]);
    expect(sink.prompts[0]?.details).toEqual([
      'New high lead, scored 92.5: “Additive manufacturing of replacement brackets” (Solicitation, due 2026-10-10), DLA AVIATION.',
    ]);
    expect(ledger.rows.map((row) => [row.key.kind, row.key.subject, row.scopeKey])).toEqual([
      ['lead-new', 'best', null],
    ]);

    // A restart an hour on: both searches answer from the cache window, and the lead is not raised again.
    advance(60 * 60 * 1000);
    const again = await scheduler.run();
    expect(again.report?.slices.map((slice) => slice.outcome)).toEqual(['cached', 'cached']);
    expect(search.queries).toHaveLength(2);
    expect(again.alerts).toEqual({ found: 1, fresh: 0, published: 0, prompted: false });
    expect(sink.prompts).toHaveLength(1);
  });

  it('[GOV-36] the rule reads the store, not the pull: a lead a bus that was down kept back is raised by the next run, and so is one a pull made by hand stored; the tier is the policy’s, and a policy with none raises nothing', async () => {
    const down = await harness();
    down.sink.failing = new Error('bus down');
    expect((await down.scheduler.run()).alerts).toEqual({
      found: 1,
      fresh: 1,
      published: 0,
      prompted: false,
    });
    down.sink.failing = null;
    down.advance(60 * 60 * 1000);
    const healed = await down.scheduler.run();
    expect(healed.report?.slices.map((slice) => slice.outcome)).toEqual(['cached', 'cached']);
    expect(healed.alerts).toMatchObject({ fresh: 1, published: 1 });

    const byHand = await harness();
    await byHand.pulls.pull('tiny', {});
    expect(byHand.sink.published).toEqual([]);
    expect((await byHand.scheduler.run()).alerts).toMatchObject({ fresh: 1, published: 1 });

    const wide = await harness({
      profile: tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, newLeadTier: 'medium' } }),
    });
    expect((await wide.scheduler.run()).alerts.found).toBe(2);
    // The better lead leads the digest.
    expect(wide.sink.published.map((alert) => alert.key.subject)).toEqual(['best', 'mid']);
    expect(wide.sink.prompts[0]?.title).toBe('2 new leads for Tiny LLC');

    const quiet = await harness({
      profile: tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, newLeadTier: null } }),
    });
    const silent = await quiet.scheduler.run();
    expect(silent.report?.slices).toHaveLength(2);
    expect(silent.alerts).toEqual({ found: 0, fresh: 0, published: 0, prompted: false });
  });

  it('[GOV-35] a store with no default profile is skipped, a source that is disabled is never asked, and a pull that cannot run is one line — the rule still runs over what is stored', async () => {
    const empty = await harness({ profile: null });
    expect(await empty.scheduler.run()).toEqual({
      profile: null,
      report: null,
      alerts: { found: 0, fresh: 0, published: 0, prompted: false },
    });
    expect(empty.search.queries).toEqual([]);

    const keyless = await harness({ enabled: false });
    await keyless.repository.upsertMany([BEST], NOW);
    const pull = vi.spyOn(keyless.pulls, 'pull');
    const skipped = await keyless.scheduler.run();
    expect(skipped.report).toBeNull();
    expect(pull).not.toHaveBeenCalled();
    expect(keyless.search.queries).toEqual([]);
    expect(skipped.alerts).toMatchObject({ found: 1, published: 1 });

    const broken = await harness();
    await broken.repository.upsertMany([BEST], NOW);
    vi.spyOn(broken.pulls, 'pull').mockRejectedValue(new Error('store asleep'));
    const run = await broken.scheduler.run();
    expect(run.report).toBeNull();
    expect(run.alerts).toMatchObject({ found: 1, published: 1 });
  });

  it('[GOV-35] started, it runs at the start and then on its cadence; never started it never pulls, and once its module is destroyed it starts nothing', async () => {
    const idle = await harness({ schedule: { everyMs: 60_000 } });
    const idleRun = vi.spyOn(idle.scheduler, 'run');
    const live = await harness({ schedule: { everyMs: 60_000 } });
    const liveRun = vi.spyOn(live.scheduler, 'run').mockResolvedValue({
      profile: null,
      report: null,
      alerts: { found: 0, fresh: 0, published: 0, prompted: false },
    });
    const gone = await harness({ schedule: { everyMs: 60_000 } });
    const goneRun = vi.spyOn(gone.scheduler, 'run');
    vi.useFakeTimers();
    try {
      live.scheduler.start();
      await gone.scheduler.onModuleDestroy();
      gone.scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(liveRun).toHaveBeenCalledTimes(2);
      await live.scheduler.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(liveRun).toHaveBeenCalledTimes(2);
      expect(idleRun).not.toHaveBeenCalled();
      expect(goneRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
