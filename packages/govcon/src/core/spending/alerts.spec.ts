import {
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  awardBodyOf,
  DEFAULT_ALERT_POLICY,
  describeAlert,
  horizonRowOf,
  interactionPromptSchema,
  noticeRefOf,
  opportunityOf,
  PROMPT_LIMITS,
  spendingHorizonOf,
  spendingPulseOf,
  type GovconAlert,
} from '@sysdesign/contracts';

import {
  alertPromptOf,
  awardEndingAlerts,
  pulseAboveBandAlerts,
  watchedAwardAlerts,
} from './alerts';

const NOW = new Date('2026-06-15T12:00:00Z');
const PROFILE = { id: 'enfav', company: 'Enfav LLC' };

describe('the alert rules', () => {
  it('[GOV-24] an award ending inside the profile’s window is one alert keyed by kind and award, the scope in its payload — a row past the window, a window of zero, or a capped horizon’s missing rows raise none', () => {
    // The fixture's rows end 2026-07-20 (35 days out) and 2026-09-14 (91 days out) from 2026-06-15.
    const horizon = spendingHorizonOf();
    const alerts = awardEndingAlerts(horizon, DEFAULT_ALERT_POLICY, 'enfav');
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    if (alert?.topic !== 'govcon.award.ending') throw new Error('expected an award alert');
    expect(alert.key).toEqual({ kind: 'award-ending', subject: horizonRowOf().externalId });
    expect(alert.payload).toMatchObject({
      profileId: 'enfav',
      scopeKey: expect.stringMatching(/^[0-9a-f]{64}$/),
      piid: 'N6660426P0205',
      family: 'contracts',
      endsAt: '2026-07-20',
      daysLeft: 35,
      amount: 266_963.4,
    });
    expect(
      awardEndingAlerts(horizon, { ...DEFAULT_ALERT_POLICY, endingWithinDays: 100 }, 'enfav'),
    ).toHaveLength(2);
    expect(
      awardEndingAlerts(horizon, { ...DEFAULT_ALERT_POLICY, endingWithinDays: 0 }, 'enfav'),
    ).toEqual([]);
    expect(awardEndingAlerts({ ...horizon, rows: [] }, DEFAULT_ALERT_POLICY, 'enfav')).toEqual([]);
    // Another scope is the same key, found elsewhere.
    const narrowed = awardEndingAlerts(
      { ...horizon, scope: { ...horizon.scope, agency: '097' } },
      DEFAULT_ALERT_POLICY,
      'enfav',
    );
    const [elsewhere] = narrowed;
    if (elsewhere?.topic !== 'govcon.award.ending') throw new Error('expected an award alert');
    expect(elsewhere.key).toEqual(alert.key);
    expect(elsewhere.payload.scopeKey).not.toBe(alert.payload.scopeKey);
  });

  it('[GOV-33] a scope’s ending award is raised only with at least the policy’s floor obligated on it, and not at all under a policy that raises tracked awards alone', () => {
    // The fixture's rows carry $266,963.40 and $0, both inside a 100-day window.
    const horizon = spendingHorizonOf();
    const within = { ...DEFAULT_ALERT_POLICY, endingWithinDays: 100 };
    expect(awardEndingAlerts(horizon, within, 'enfav')).toHaveLength(2);
    const floored = awardEndingAlerts(horizon, { ...within, minObligated: 100_000 }, 'enfav');
    expect(floored.map((alert) => alert.key.subject)).toEqual([horizonRowOf().externalId]);
    // The floor is inclusive: an award with exactly that much on it is raised.
    expect(
      awardEndingAlerts(horizon, { ...within, minObligated: 266_963.4 }, 'enfav'),
    ).toHaveLength(1);
    expect(awardEndingAlerts(horizon, { ...within, minObligated: 266_963.41 }, 'enfav')).toEqual(
      [],
    );
    expect(awardEndingAlerts(horizon, { ...within, audience: 'watched' }, 'enfav')).toEqual([]);
  });

  it('[GOV-32] a tracked award’s own record raises that it ends inside the window whatever is obligated on it, that its end is no longer the one last read, and each open stored notice sharing its buyer and code — and an end read for the first time has moved from nothing', () => {
    // The fixture award ends 2026-12-26; from 2026-10-01 that is 86 days out.
    const award = awardBodyOf({ obligated: 0 });
    const notice = noticeRefOf(opportunityOf());
    const strict = { ...DEFAULT_ALERT_POLICY, audience: 'watched' as const, minObligated: 1e9 };
    const seen = (lastEndsAt: string | null, openNotices = [notice]) =>
      watchedAwardAlerts({ lastEndsAt, award, openNotices }, strict, 'enfav', '2026-10-01');

    const first = seen(null);
    expect(first.map((alert) => alert.key)).toEqual([
      { kind: 'award-ending', subject: award.externalId },
      { kind: 'award-notice', subject: `${award.externalId}|${notice.noticeId}` },
    ]);
    const [ending, found] = first;
    if (ending?.topic !== 'govcon.award.ending') throw new Error('expected an ending alert');
    // No scope found it, and the floor does not apply to what is tracked.
    expect(ending.payload).toEqual({
      profileId: 'enfav',
      scopeKey: null,
      externalId: award.externalId,
      piid: '89303019FET000003',
      recipientName: 'BOOZ ALLEN HAMILTON INC',
      agencyPath: award.agencyPath,
      family: 'contracts',
      naicsCode: '541511',
      amount: 0,
      endsAt: '2026-12-26',
      daysLeft: 86,
    });
    if (found?.topic !== 'govcon.award.notice') throw new Error('expected a notice alert');
    expect(found.payload).toMatchObject({
      externalId: award.externalId,
      noticeId: notice.noticeId,
      title: notice.title,
      noticeType: notice.noticeType,
      responseDeadlineAt: notice.responseDeadlineAt,
    });

    // The same end as last read moves nothing; a different one is one alert keyed by where it moved to.
    expect(seen('2026-12-26', []).map((alert) => alert.key.kind)).toEqual(['award-ending']);
    const moved = seen('2026-09-30', []).find((alert) => alert.topic === 'govcon.award.end-moved');
    expect(moved).toEqual({
      topic: 'govcon.award.end-moved',
      key: { kind: 'award-end-moved', subject: `${award.externalId}|2026-12-26` },
      payload: {
        profileId: 'enfav',
        externalId: award.externalId,
        piid: '89303019FET000003',
        recipientName: 'BOOZ ALLEN HAMILTON INC',
        agencyPath: award.agencyPath,
        from: '2026-09-30',
        to: '2026-12-26',
      },
    });

    // Past the window, already ended, or a window of zero: no ending alert, and the rest still stand.
    const kinds = (today: string, policy = strict) =>
      watchedAwardAlerts(
        { lastEndsAt: '2026-09-30', award, openNotices: [] },
        policy,
        'enfav',
        today,
      ).map((alert) => alert.key.kind);
    expect(kinds('2026-09-27')).toEqual(['award-ending', 'award-end-moved']);
    expect(kinds('2026-09-26')).toEqual(['award-end-moved']);
    expect(kinds('2026-12-27')).toEqual(['award-end-moved']);
    expect(kinds('2026-10-01', { ...strict, endingWithinDays: 0 })).toEqual(['award-end-moved']);
    // An award the source gives no end for has nothing to end or to move.
    expect(
      watchedAwardAlerts(
        { lastEndsAt: '2026-09-30', award: { ...award, endsAt: null }, openNotices: [] },
        strict,
        'enfav',
        '2026-10-01',
      ),
    ).toEqual([]);
  });

  it('[GOV-24] the partial period above its projected high is one alert per period, and none without a projection, a partial period, a projected period, a total inside the band, or the policy', () => {
    const pulse = spendingPulseOf();
    const partial = pulse.series.find((point) => point.partial);
    const projected = pulse.projection?.periods.find((period) => period.period === partial?.period);
    if (partial === undefined || projected === undefined)
      throw new Error('fixture lacks a partial');
    const withPartialAt = (total: number) => ({
      ...pulse,
      series: pulse.series.map((point) => (point.partial ? { ...point, total } : point)),
    });
    const above = withPartialAt(projected.high + 1);
    const alerts = pulseAboveBandAlerts(above, DEFAULT_ALERT_POLICY, 'enfav');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      topic: 'govcon.pulse.above-band',
      key: { kind: 'pulse-above-band', subject: `${partial.fiscalYear}-${partial.period}` },
      payload: {
        fiscalYear: partial.fiscalYear,
        period: partial.period,
        total: projected.high + 1,
        expected: projected.expected,
        high: projected.high,
      },
    });
    // At the high, or anywhere inside the band, is not above it.
    expect(
      pulseAboveBandAlerts(withPartialAt(projected.high), DEFAULT_ALERT_POLICY, 'enfav'),
    ).toEqual([]);
    expect(
      pulseAboveBandAlerts(withPartialAt(projected.low), DEFAULT_ALERT_POLICY, 'enfav'),
    ).toEqual([]);
    expect(
      pulseAboveBandAlerts({ ...above, projection: null }, DEFAULT_ALERT_POLICY, 'enfav'),
    ).toEqual([]);
    expect(
      pulseAboveBandAlerts(
        { ...above, series: above.series.map((point) => ({ ...point, partial: false })) },
        DEFAULT_ALERT_POLICY,
        'enfav',
      ),
    ).toEqual([]);
    expect(
      pulseAboveBandAlerts(above, { ...DEFAULT_ALERT_POLICY, pulseAboveBand: false }, 'enfav'),
    ).toEqual([]);
  });

  it('[GOV-24] the digest names the count and the company, lists at most ALERT_PROMPT_MAX_ITEMS lines — the weightiest first — and counts the rest, offers one choice, expires after ALERT_PROMPT_TTL_DAYS, and the interaction schema accepts it', () => {
    expect(ALERT_PROMPT_MAX_ITEMS + 1).toBeLessThanOrEqual(PROMPT_LIMITS.details);
    const [one] = awardEndingAlerts(spendingHorizonOf(), DEFAULT_ALERT_POLICY, 'enfav');
    if (one?.topic !== 'govcon.award.ending') throw new Error('expected an award alert');
    const many: GovconAlert[] = Array.from({ length: ALERT_PROMPT_MAX_ITEMS + 3 }, (_, index) => ({
      ...one,
      key: { ...one.key, subject: `award-${index}` },
    }));
    const prompt = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: many,
      now: NOW,
    });
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt.title).toBe(`${ALERT_PROMPT_MAX_ITEMS + 3} spending alerts for Enfav LLC`);
    expect(prompt.details).toHaveLength(ALERT_PROMPT_MAX_ITEMS + 1);
    expect(prompt.details.at(-1)).toBe('…and 3 more on the dashboard.');
    expect(prompt.details[0]).toBe(describeAlert(one));
    expect(prompt.choices.map((choice) => choice.id)).toEqual(['noted']);
    expect(prompt.freeText).toBeNull();
    expect(prompt.origin).toEqual({ kind: 'govcon.spending', id: 'enfav', label: 'Enfav LLC' });
    expect(prompt.expiresAt).toBe(
      new Date(NOW.getTime() + ALERT_PROMPT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    // By kind first — a finding about the whole scope before the ending awards — then the most obligated.
    const large: GovconAlert = {
      ...one,
      key: { ...one.key, subject: 'large' },
      payload: { ...one.payload, piid: 'LARGE', amount: 9_000_000 },
    };
    const pulse = pulseAboveBandAlerts(
      {
        ...spendingPulseOf(),
        series: spendingPulseOf().series.map((point) =>
          point.partial ? { ...point, total: Number.MAX_SAFE_INTEGER } : point,
        ),
      },
      DEFAULT_ALERT_POLICY,
      'enfav',
    );
    const ranked = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [one, large, ...pulse],
      now: NOW,
    });
    expect(ranked.details.map((line) => line.slice(0, 5))).toEqual(['FY202', 'LARGE', 'N6660']);
    const single = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [one],
      now: NOW,
    });
    expect(single.title).toBe('1 spending alert for Enfav LLC');
    expect(single.details).toEqual([describeAlert(one)]);

    // A tracked award's news leads the digest: someone chose to follow it.
    const moved: GovconAlert = {
      topic: 'govcon.award.end-moved',
      key: { kind: 'award-end-moved', subject: 'a|2027-01-01' },
      payload: {
        profileId: 'enfav',
        externalId: 'a',
        piid: 'MOVED',
        recipientName: null,
        agencyPath: null,
        from: '2026-07-20',
        to: '2027-01-01',
      },
    };
    const led = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [large, one, ...pulse, moved],
      now: NOW,
    });
    expect(led.details.map((line) => line.slice(0, 5))).toEqual([
      'MOVED',
      'FY202',
      'LARGE',
      'N6660',
    ]);
  });
});
