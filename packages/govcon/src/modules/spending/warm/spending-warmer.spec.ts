import {
  agencyDirectoryEntryOf,
  awardBodyOf,
  DEFAULT_ALERT_POLICY,
  horizonRowOf,
  interactionPromptSchema,
  type HorizonRequest,
  type SeriesRequest,
} from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../../core/budget';
import type { AwardRecord, SeriesPoint } from '../../../core/ports';
import {
  fetchedOf,
  InMemoryAlertLedger,
  InMemorySnapshotStore,
  RecordingAlertSink,
  scriptedSpendingSources,
  seriesPointOf,
  type SpendingScript,
} from '../../../core/spending/testing';
import {
  failure,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  InMemorySourceCallLog,
  InMemoryTargetRepository,
  tinyProfile,
} from '../../../core/testing';
import { ProfilesService } from '../../profiles/profiles.service';
import { SpendingService } from '../spending.service';
import { SpendingWarmer, type WarmReport } from './spending-warmer';
import type { SpendingWarmPolicy } from './warm-policy';
import { WatchedAwards } from './watched-awards';

/** 2026-06-15: period 9 of FY2026. */
const T0 = new Date('2026-06-15T12:00:00Z');

/** Three complete prior years at 100 a period, this year at 100 through period 8 and 500 in the period in progress — above every prior year's. */
const SERIES: SeriesPoint[] = [
  ...[2023, 2024, 2025].flatMap((fiscalYear) =>
    Array.from({ length: 12 }, (_, index) =>
      seriesPointOf({ fiscalYear, period: index + 1, contracts: 100, idvs: 0, total: 100 }),
    ),
  ),
  ...Array.from({ length: 9 }, (_, index) =>
    seriesPointOf({
      fiscalYear: 2026,
      period: index + 1,
      contracts: index === 8 ? 500 : 100,
      idvs: 0,
      total: index === 8 ? 500 : 100,
    }),
  ),
];

const SCRIPT: SpendingScript = {
  series: [fetchedOf(SERIES)],
  breakdowns: [
    fetchedOf({
      rows: [
        { id: '1173', code: 'DOD', name: 'Department of Defense', amount: 500 },
        { id: '862', code: 'NASA', name: 'NASA', amount: 300 },
        { id: null, code: null, name: 'unnamed', amount: 1 },
      ],
      hasMore: false,
    }),
  ],
  // One page, answered to both families (the script repeats its last reply): the same award twice, so one alert — the key dedupes.
  ending: [
    fetchedOf({ rows: [horizonRowOf({ endsAt: '2026-07-05' })], rejected: 0, hasMore: false }),
  ],
  catalog: [
    fetchedOf([
      agencyDirectoryEntryOf(),
      agencyDirectoryEntryOf({ agencyId: 862, toptierCode: '080', abbreviation: 'NASA' }),
    ]),
  ],
};

function harness(options: { script?: SpendingScript; policy?: SpendingWarmPolicy } = {}) {
  const clock = () => T0;
  const log = new InMemorySourceCallLog();
  const budget: BudgetPolicy = { ttlMs: 60 * 60 * 1000, pullDeadlineMs: 60_000, buckets: {} };
  const sources = scriptedSpendingSources(options.script ?? SCRIPT);
  const spending = new SpendingService(
    new InMemorySnapshotStore(),
    sources,
    budget,
    new RequestGate(log, budget, clock),
    clock,
    new InMemoryOpportunityRepository(),
  );
  const profiles = new ProfilesService(
    new InMemoryProfileRepository(),
    new InMemorySavedSearchRepository(),
    clock,
  );
  const ledger = new InMemoryAlertLedger();
  const sink = new RecordingAlertSink();
  const targets = new InMemoryTargetRepository();
  const warmer = new SpendingWarmer(
    options.policy ?? { everyMs: null },
    spending,
    profiles,
    new WatchedAwards(spending, targets, ledger, clock),
    ledger,
    sink,
    clock,
  );
  return {
    warmer,
    sources,
    ledger,
    sink,
    profiles,
    targets,
    operations: () => log.calls.map((call) => call.operation),
  };
}

const outcomes = (report: WarmReport) =>
  report.lenses.map((lens) => [lens.lens, lens.outcome, 'status' in lens ? lens.status : null]);

describe('the spending warmer', () => {
  it('[GOV-22] a warm forces every declared lens for the default profile’s NAICS, then the horizon and the outlook of each top agency the breakdown names over a rolling year, never throws, and skips an empty store', async () => {
    const { warmer, sources, profiles, operations } = harness();
    await profiles.create(tinyProfile());
    const report = await warmer.warm();
    expect(report.profile).toBe('tiny');
    expect(outcomes(report)).toEqual([
      ['pulse', 'ok', null],
      ['breakdown', 'ok', null],
      ['reach', 'ok', null],
      ['horizon', 'ok', null],
      ['agencies', 'ok', null],
      ['horizon 097', 'ok', null],
      ['agency 097', 'ok', null],
      ['horizon 080', 'ok', null],
      ['agency 080', 'ok', null],
    ]);
    expect(
      report.lenses.every((lens) => lens.outcome === 'ok' && lens.servedFrom === 'source'),
    ).toBe(true);
    expect(sources.requests.series[0] as SeriesRequest).toMatchObject({
      naics: ['332710', '5415'],
      psc: [],
      agency: null,
      awardFamily: 'both',
      group: 'month',
    });
    expect(sources.requests.breakdowns[0]).toMatchObject({
      category: 'awarding_agency',
      from: '2025-06-15',
      to: '2026-06-15',
    });
    // The reach count is taken over the same year, for the lanes the profile prices above nothing.
    expect(sources.requests.counts[1]).toMatchObject({
      naics: ['332710', '5415'],
      awardFamily: 'contracts',
      from: '2025-06-15',
      to: '2026-06-15',
      facets: { newOnly: true, setAside: ['NONE', 'SBA', 'SBP'] },
    });
    expect(
      (sources.requests.ending as HorizonRequest[]).map((request) => [
        request.family,
        request.agency?.toptierCode ?? null,
      ]),
    ).toEqual([
      ['contracts', null],
      ['idvs', null],
      ['contracts', '097'],
      ['idvs', '097'],
      ['contracts', '080'],
      ['idvs', '080'],
    ]);
    expect(
      sources.requests.budgets.map((request) => (request as { toptierCode: string }).toptierCode),
    ).toEqual(['097', '080']);
    expect(operations()).toContain('agency-offices');

    // Inside the TTL a second warm still asks the source: a forced refresh, not a snapshot.
    const again = await warmer.warm();
    expect(
      again.lenses.every((lens) => lens.outcome === 'ok' && lens.servedFrom === 'source'),
    ).toBe(true);
    expect(sources.requests.series.length).toBeGreaterThan(2);

    const empty = harness();
    expect(await empty.warmer.warm()).toEqual({
      profile: null,
      lenses: [],
      alerts: { found: 0, fresh: 0, published: 0, prompted: false },
    });
    expect(empty.sources.requests.series).toHaveLength(0);
  });

  it('[GOV-22] a lens the source refuses is one refused line and the rest still run, and a profile naming more codes than a scope may is refused by the request schema', async () => {
    const refused = harness({ script: { ...SCRIPT, series: [failure('error', 502, 'boom')] } });
    await refused.profiles.create(tinyProfile());
    const report = await refused.warmer.warm();
    expect(outcomes(report)).toEqual([
      ['pulse', 'refused', 502],
      ['breakdown', 'refused', 502],
      ['reach', 'refused', 502],
      ['horizon', 'ok', null],
      ['agencies', 'ok', null],
    ]);
    // The horizon answered, so its alert was still raised.
    expect(report.alerts).toEqual({ found: 1, fresh: 1, published: 1, prompted: true });

    const wide = harness();
    await wide.profiles.create(
      tinyProfile({ naics: Array.from({ length: 21 }, (_, index) => String(100_000 + index)) }),
    );
    const widened = await wide.warmer.warm();
    expect(outcomes(widened)).toEqual([
      ['pulse', 'refused', 400],
      ['breakdown', 'refused', 400],
      ['reach', 'refused', 400],
      ['horizon', 'refused', 400],
      ['agencies', 'ok', null],
    ]);
    expect(wide.sources.requests.series).toHaveLength(0);
  });

  it('[GOV-22] starts only when told, once, on the declared cadence — the run at start unforced, every tick after it a renewal — a cadence of null schedules nothing, and stop is safe before start', async () => {
    const idle = harness();
    const idleWarm = vi.spyOn(idle.warmer, 'warm');
    await idle.warmer.stop();
    idle.warmer.start();
    idle.warmer.start();
    expect(idleWarm).not.toHaveBeenCalled();
    await idle.warmer.stop();

    const live = harness({ policy: { everyMs: 60_000 } });
    const liveWarm = vi.spyOn(live.warmer, 'warm').mockResolvedValue({
      profile: null,
      lenses: [],
      alerts: { found: 0, fresh: 0, published: 0, prompted: false },
    });
    vi.useFakeTimers();
    try {
      live.warmer.start();
      live.warmer.start();
      await vi.advanceTimersByTimeAsync(0);
      // At start: what the cache window still holds. On each tick after: a renewal.
      expect(liveWarm.mock.calls).toEqual([[{ refresh: false }]]);
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(liveWarm.mock.calls).toEqual([
        [{ refresh: false }],
        [{ refresh: true }],
        [{ refresh: true }],
      ]);
      await live.warmer.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(liveWarm).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('[GOV-22] starts nothing once its module is destroyed — a service told to stop while still booting never warms against a closed store', async () => {
    const { warmer } = harness({ policy: { everyMs: 60_000 } });
    const warm = vi.spyOn(warmer, 'warm');
    vi.useFakeTimers();
    try {
      await warmer.onModuleDestroy();
      warmer.start();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(warm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('[GOV-22] a warm at start reads what the cache window still holds — every lens a snapshot, no request, no alert raised again — while a scheduled warm renews', async () => {
    const { warmer, sources, sink, profiles } = harness();
    await profiles.create(tinyProfile());
    await warmer.warm();
    const requestsOf = () =>
      Object.values(sources.requests).reduce((total, seen) => total + seen.length, 0);
    const spent = requestsOf();
    const published = sink.published.length;

    const restarted = await warmer.warm({ refresh: false });
    expect(restarted.lenses.length).toBeGreaterThan(0);
    expect(
      restarted.lenses.every((lens) => lens.outcome === 'ok' && lens.servedFrom === 'snapshot'),
    ).toBe(true);
    expect(requestsOf()).toBe(spent);
    expect(restarted.alerts).toMatchObject({ fresh: 0, published: 0, prompted: false });
    expect(sink.published).toHaveLength(published);

    await warmer.warm();
    expect(requestsOf()).toBeGreaterThan(spent);
  });

  it('[GOV-24] after a warm each new alert is published once on its declared topic — the same award through every horizon is one — one digest prompt per warm lists them for the profile, what was already raised is not published again, nothing is recorded that was not published, and the policy is the profile’s', async () => {
    const { warmer, sink, ledger, profiles } = harness();
    await profiles.create(tinyProfile());
    const first = await warmer.warm();
    expect(first.alerts).toEqual({ found: 2, fresh: 2, published: 2, prompted: true });
    // Published in the order the digest lists them: the finding about the whole scope, then the ending award.
    expect(sink.published.map((alert) => alert.topic)).toEqual([
      'govcon.pulse.above-band',
      'govcon.award.ending',
    ]);
    expect(sink.prompts).toHaveLength(1);
    const [prompt] = sink.prompts;
    if (prompt === undefined) throw new Error('expected a digest');
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt.title).toBe('2 spending alerts for Tiny LLC');
    expect(prompt.details).toHaveLength(2);
    // The same award came through three horizons — the profile's and two agencies' — and is one alert.
    expect(
      ledger.rows.map((row) => [row.key.kind, row.position, row.eventSeq, row.promptId]),
    ).toEqual([
      ['pulse-above-band', 0, '1', prompt.id],
      ['award-ending', 1, '2', prompt.id],
    ]);
    expect(ledger.rows[1]?.scopeKey).toMatch(/^[0-9a-f]{64}$/);

    const second = await warmer.warm();
    expect(second.alerts).toEqual({ found: 2, fresh: 0, published: 0, prompted: false });
    expect(sink.published).toHaveLength(2);
    expect(sink.prompts).toHaveLength(1);

    const down = harness();
    await down.profiles.create(tinyProfile());
    down.sink.failing = new Error('bus down');
    const unsent = await down.warmer.warm();
    expect(unsent.alerts).toEqual({ found: 2, fresh: 2, published: 0, prompted: false });
    expect(down.ledger.rows).toEqual([]);

    const quiet = harness();
    await quiet.profiles.create(
      tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, pulseAboveBand: false } }),
    );
    expect((await quiet.warmer.warm()).alerts.found).toBe(1);
    expect(quiet.sink.published.map((alert) => alert.topic)).toEqual(['govcon.award.ending']);

    const unread = harness();
    await unread.profiles.create(tinyProfile());
    unread.ledger.failing = new Error('ledger down');
    expect((await unread.warmer.warm()).alerts).toEqual({
      found: 2,
      fresh: 0,
      published: 0,
      prompted: false,
    });
  });

  it('[GOV-32] [GOV-33] a warm reads every tracked award after the scope and raises what its record shows once — its own record kept when a scope lists the same award — keeps what was published on the ledger, and writes back the end it read only once the alert for the move is raised', async () => {
    // The award the scope's horizon lists, tracked too: its record ends the same day, and its end was last read five days earlier.
    const id = horizonRowOf().externalId;
    const {
      orders: _orders,
      subcontracts: _roster,
      ...body
    } = awardBodyOf({
      externalId: id,
      endsAt: '2026-07-05',
      subcontractCount: 0,
    });
    const script = { ...SCRIPT, awardDetails: [fetchedOf<AwardRecord | null>(body)] };
    const key = { kind: 'award' as const, subject: id };
    const input = {
      label: 'P',
      stage: 'watching' as const,
      notes: '',
      contact: '',
      reminderAt: null,
    };
    const tracking = async (options: Parameters<typeof harness>[0] = { script }) => {
      const made = harness(options);
      await made.profiles.create(tinyProfile());
      await made.targets.save(key, input, T0);
      await made.targets.observe(key, '2026-06-30');
      return made;
    };

    const { warmer, sink, ledger, targets } = await tracking();
    const report = await warmer.warm();
    expect(outcomes(report).at(-1)).toEqual([`award ${id}`, 'ok', null]);
    expect(report.alerts).toEqual({ found: 3, fresh: 3, published: 3, prompted: true });
    // Raised in the order a person reads them: the tracked award's news, the whole-scope finding, the ending award.
    expect(sink.published.map((alert) => alert.topic)).toEqual([
      'govcon.award.end-moved',
      'govcon.pulse.above-band',
      'govcon.award.ending',
    ]);
    // One ending alert for the award, and it is the tracked record's: no scope found it first.
    expect(ledger.rows.map((row) => [row.key.kind, row.position, row.scopeKey === null])).toEqual([
      ['award-end-moved', 0, true],
      ['pulse-above-band', 1, false],
      ['award-ending', 2, true],
    ]);
    expect(ledger.rows[0]?.payload).toEqual({
      profileId: 'tiny',
      externalId: id,
      piid: body.piid,
      recipientName: body.recipient.name,
      agencyPath: body.agencyPath,
      from: '2026-06-30',
      to: '2026-07-05',
    });
    expect(ledger.rows[2]?.payload).toEqual(sink.published[2]?.payload);
    expect((await targets.find(key))?.endsAt).toBe('2026-07-05');
    // The digest leads with the tracked award's news.
    expect(sink.prompts[0]?.details[0]).toContain('now ends 2026-07-05, not 2026-06-30');

    // A bus that is down raises nothing, so the end read is not written: the next warm finds the move again.
    const down = await tracking();
    down.sink.failing = new Error('bus down');
    expect((await down.warmer.warm()).alerts).toMatchObject({ found: 3, published: 0 });
    expect((await down.targets.find(key))?.endsAt).toBe('2026-06-30');
    down.sink.failing = null;
    expect((await down.warmer.warm()).alerts).toMatchObject({ fresh: 3, published: 3 });
    expect((await down.targets.find(key))?.endsAt).toBe('2026-07-05');

    // A policy that raises tracked awards alone: the scope's ending award is not raised, the tracked one is.
    const narrow = harness({ script });
    await narrow.profiles.create(
      tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, audience: 'watched' } }),
    );
    expect((await narrow.warmer.warm()).alerts.found).toBe(1);
    expect(narrow.sink.published.map((alert) => alert.topic)).toEqual(['govcon.pulse.above-band']);
    await narrow.targets.save(key, input, T0);
    expect((await narrow.warmer.warm()).alerts).toMatchObject({ found: 2, fresh: 1 });
    expect(narrow.sink.published.at(-1)?.topic).toBe('govcon.award.ending');

    // A target store that cannot be read is one line; the scope's alerts are still raised.
    const blind = await tracking();
    vi.spyOn(blind.targets, 'listAll').mockRejectedValue(new Error('store down'));
    const unseen = await blind.warmer.warm();
    expect(outcomes(unseen).some(([lens]) => String(lens).startsWith('award '))).toBe(false);
    expect(unseen.alerts).toEqual({ found: 2, fresh: 2, published: 2, prompted: true });
  });
});
