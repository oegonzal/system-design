import { type HorizonRequest, type SeriesRequest } from '@sysdesign/contracts';

import { failure, tinyProfile } from '../../../core/testing';
import { harness, outcomes, SCRIPT } from './testing';

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
});
