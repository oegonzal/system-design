import {
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  DEFAULT_ALERT_POLICY,
  describeAlert,
  interactionPromptSchema,
  PROMPT_LIMITS,
  spendingHorizonOf,
  spendingPulseOf,
  type GovconAlert,
} from '@sysdesign/contracts';

import { alertPromptOf } from './digest';
import { awardEndingAlerts, pulseAboveBandAlerts, SPENDING_DIGEST } from './spending';

const NOW = new Date('2026-06-15T12:00:00Z');
const PROFILE = { id: 'enfav', company: 'Enfav LLC' };

describe('the alert digest', () => {
  it('[GOV-24] the digest names the count, what its kind calls the alerts and the company, lists at most ALERT_PROMPT_MAX_ITEMS lines — the weightiest first — and counts the rest, offers one choice, expires after ALERT_PROMPT_TTL_DAYS, and the interaction schema accepts it', () => {
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
      kind: SPENDING_DIGEST,
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
      kind: SPENDING_DIGEST,
      now: NOW,
    });
    expect(ranked.details.map((line) => line.slice(0, 5))).toEqual(['FY202', 'LARGE', 'N6660']);
    const single = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [one],
      kind: SPENDING_DIGEST,
      now: NOW,
    });
    expect(single.title).toBe('1 spending alert for Enfav LLC');
    expect(single.details).toEqual([describeAlert(one)]);
    // The words and the origin are the kind's: the digest names no producer of its own.
    const other = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [one, large],
      kind: { origin: 'govcon.other', one: 'finding', many: 'findings' },
      now: NOW,
    });
    expect(other.title).toBe('2 findings for Enfav LLC');
    expect(other.origin.kind).toBe('govcon.other');

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
      kind: SPENDING_DIGEST,
      now: NOW,
    });
    expect(led.details.map((line) => line.slice(0, 5))).toEqual([
      'MOVED',
      'FY202',
      'LARGE',
      'N6660',
    ]);
    // A notice to answer stands ahead of a finding about the scope, and the better-scored lead ahead of the other.
    const lead = (noticeId: string, score: number): GovconAlert => ({
      topic: 'govcon.lead.new',
      key: { kind: 'lead-new', subject: noticeId },
      payload: {
        profileId: 'enfav',
        noticeId,
        title: noticeId,
        noticeType: null,
        agencyPath: null,
        naicsCode: null,
        responseDeadlineAt: null,
        score,
        tier: 'high',
      },
    });
    const mixed = alertPromptOf({
      id: crypto.randomUUID(),
      profile: PROFILE,
      alerts: [one, ...pulse, lead('second', 71), moved, lead('first', 90)],
      kind: SPENDING_DIGEST,
      now: NOW,
    });
    expect(mixed.details.map((line) => line.slice(0, 26))).toEqual([
      'MOVED now ends 2027-01-01,',
      'New high lead, scored 90: ',
      'New high lead, scored 71: ',
      expect.stringMatching(/^FY2026 period/),
      expect.stringMatching(/^N6660426P0205/),
    ]);
  });
});
