import {
  agencyOf,
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  compactMoney,
  DEFAULT_ALERT_POLICY,
  horizonRowOf,
  interactionPromptSchema,
  PROMPT_LIMITS,
  spendingHorizonOf,
  spendingPulseOf,
  type GovconAlert,
} from '@sysdesign/contracts';

import { alertPromptOf, awardEndingAlerts, describeAlert, pulseAboveBandAlerts } from './alerts';

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
    expect(narrowed[0]?.key).toEqual(alert.key);
    expect(narrowed[0]?.payload.scopeKey).not.toBe(alert.payload.scopeKey);
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
    expect(prompt.details.at(-1)).toBe('…and 3 more on the Spending page.');
    expect(prompt.details[0]).toBe(describeAlert(one));
    expect(prompt.choices.map((choice) => choice.id)).toEqual(['noted']);
    expect(prompt.freeText).toBeNull();
    expect(prompt.origin).toEqual({ kind: 'govcon.spending', id: 'enfav', label: 'Enfav LLC' });
    expect(prompt.expiresAt).toBe(
      new Date(NOW.getTime() + ALERT_PROMPT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    // The weightiest first: a finding about the whole scope, then the award with the most obligated.
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
    expect(describeAlert(one)).toBe(
      `N6660426P0205 (contracts) ends 2026-07-20, in 35 day(s): VIRGINIA HIGHLANDS MACHINE INC., ${compactMoney(266_963.4)} obligated, ${agencyOf('Department of Defense.Department of the Navy')}.`,
    );
  });
});
