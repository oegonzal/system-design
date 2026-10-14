import { NOTIFICATION_TOPICS } from '../notifications/topics';
import {
  ALERT_DECLARATIONS,
  ALERT_KINDS,
  alertKeyOf,
  awardEndingSchema,
  awardEndMovedSchema,
  awardNoticeSchema,
  describeAlert,
  GOVCON_TOPICS,
  pulseAboveBandSchema,
  type GovconAlert,
} from './alerts';

const SCOPE_KEY = 'a'.repeat(64);
const NAMED = {
  profileId: 'enfav',
  externalId: 'CONT_AWD_1',
  piid: 'N6660426P0205',
  recipientName: 'Acme',
  agencyPath: 'Department of Defense.Department of the Navy',
};
const AWARD = {
  ...NAMED,
  scopeKey: SCOPE_KEY,
  family: 'contracts',
  naicsCode: '332710',
  amount: 1000,
  endsAt: '2026-08-01',
  daysLeft: 47,
};
const MOVED = { ...NAMED, from: '2026-08-01', to: '2027-08-01' };
const NOTICE = {
  ...NAMED,
  noticeId: 'n-1',
  title: 'Sustainment follow-on',
  noticeType: 'Sources Sought',
  responseDeadlineAt: '2026-07-01T17:00:00.000Z',
};
const PULSE = {
  profileId: 'enfav',
  scopeKey: SCOPE_KEY,
  fiscalYear: 2026,
  period: 9,
  total: 900,
  expected: 500,
  high: 800,
};

describe('the govcon alerts', () => {
  it('[GOV-24] declares every topic on the bus for anyone to publish, each with the payload the warm publishes, refuses a payload beside it, and spells one key per kind and subject', () => {
    for (const topic of Object.values(GOVCON_TOPICS)) {
      expect(NOTIFICATION_TOPICS[topic]?.publishedBy).toBe('anyone');
    }
    // One declaration per kind, and one topic per declaration: nothing is published that the bus was not told of.
    expect(Object.keys(ALERT_DECLARATIONS).sort()).toEqual([...ALERT_KINDS].sort());
    expect(
      ALERT_KINDS.map((kind) => NOTIFICATION_TOPICS[ALERT_DECLARATIONS[kind].topic]?.schema),
    ).toEqual(ALERT_KINDS.map((kind) => ALERT_DECLARATIONS[kind].schema));
    expect(new Set(ALERT_KINDS.map((kind) => ALERT_DECLARATIONS[kind].topic)).size).toBe(
      ALERT_KINDS.length,
    );

    expect(awardEndingSchema.parse(AWARD)).toEqual(AWARD);
    expect(awardEndingSchema.safeParse({ ...AWARD, daysLeft: -1 }).success).toBe(false);
    expect(awardEndingSchema.safeParse({ ...AWARD, scopeKey: 'short' }).success).toBe(false);
    expect(awardEndingSchema.safeParse({ ...AWARD, extra: true }).success).toBe(false);
    expect(pulseAboveBandSchema.parse(PULSE)).toEqual(PULSE);
    expect(pulseAboveBandSchema.safeParse({ ...PULSE, period: 13 }).success).toBe(false);
    expect(alertKeyOf({ kind: 'award-ending', subject: 'CONT_AWD_1' })).toBe(
      'award-ending:CONT_AWD_1',
    );
  });

  it('[GOV-32] an alert about a tracked award carries no scope: an ending one with a null scope, an end that moved with both days, a notice with what it is called and when it is due — and a whole-scope finding still needs its scope', () => {
    expect(awardEndingSchema.parse({ ...AWARD, scopeKey: null }).scopeKey).toBeNull();
    expect(awardEndMovedSchema.parse(MOVED)).toEqual(MOVED);
    expect(awardEndMovedSchema.safeParse({ ...MOVED, to: 'next year' }).success).toBe(false);
    expect(awardEndMovedSchema.safeParse({ ...MOVED, scopeKey: SCOPE_KEY }).success).toBe(false);
    expect(awardNoticeSchema.parse(NOTICE)).toEqual(NOTICE);
    expect(
      awardNoticeSchema.parse({ ...NOTICE, noticeType: null, responseDeadlineAt: null }),
    ).toMatchObject({ noticeType: null, responseDeadlineAt: null });
    expect(awardNoticeSchema.safeParse({ ...NOTICE, noticeId: '' }).success).toBe(false);
    expect(pulseAboveBandSchema.safeParse({ ...PULSE, scopeKey: null }).success).toBe(false);
  });

  it('[GOV-33] reads a stored payload back as the alert it was, by its kind, and as nothing when that kind’s schema refuses it or no payload was kept', () => {
    const key = { kind: 'award-end-moved' as const, subject: 'CONT_AWD_1|2027-08-01' };
    expect(ALERT_DECLARATIONS['award-end-moved'].read(key, MOVED)).toEqual({
      topic: 'govcon.award.end-moved',
      key,
      payload: MOVED,
    });
    expect(
      ALERT_KINDS.map((kind) =>
        ALERT_DECLARATIONS[kind].read({ kind, subject: 's' }, { AWARD, MOVED, NOTICE, PULSE }),
      ),
    ).toEqual([null, null, null, null]);
    // A row from before payloads were kept.
    expect(
      ALERT_DECLARATIONS['award-ending'].read({ kind: 'award-ending', subject: 's' }, null),
    ).toBeNull();
    // Another kind's payload is not this kind's.
    expect(
      ALERT_DECLARATIONS['award-notice'].read({ kind: 'award-notice', subject: 's' }, PULSE),
    ).toBeNull();
    expect(
      ALERT_DECLARATIONS['pulse-above-band'].read({ kind: 'pulse-above-band', subject: 's' }, PULSE)
        ?.topic,
    ).toBe('govcon.pulse.above-band');
  });

  it('[GOV-24] [GOV-32] says each alert in one line a person reads — the digest’s and the list’s — naming the award by its PIID, or by the source’s id when it has none', () => {
    const line = (alert: GovconAlert): string => describeAlert(alert);
    const key = { kind: 'award-ending' as const, subject: 'CONT_AWD_1' };
    expect(
      line({ topic: 'govcon.award.ending', key, payload: awardEndingSchema.parse(AWARD) }),
    ).toBe(
      'N6660426P0205 (contracts) ends 2026-08-01, in 47 day(s): Acme, $1K obligated, Department of the Navy.',
    );
    expect(
      line({
        topic: 'govcon.award.ending',
        key,
        payload: awardEndingSchema.parse({
          ...AWARD,
          piid: null,
          recipientName: null,
          agencyPath: null,
        }),
      }),
    ).toBe(
      'CONT_AWD_1 (contracts) ends 2026-08-01, in 47 day(s): recipient not named, $1K obligated, agency not named.',
    );
    expect(line({ topic: 'govcon.award.end-moved', key, payload: MOVED })).toBe(
      'N6660426P0205 now ends 2027-08-01, not 2026-08-01: Acme. It was extended, so its follow-on is further off.',
    );
    expect(
      line({
        topic: 'govcon.award.end-moved',
        key,
        payload: { ...MOVED, from: '2027-08-01', to: '2026-12-31' },
      }),
    ).toBe('N6660426P0205 now ends 2026-12-31, not 2027-08-01: Acme. It was cut short.');
    expect(line({ topic: 'govcon.award.notice', key, payload: NOTICE })).toBe(
      'A stored notice may follow N6660426P0205: “Sustainment follow-on” (Sources Sought, due 2026-07-01), same buyer and code.',
    );
    expect(
      line({
        topic: 'govcon.award.notice',
        key,
        payload: { ...NOTICE, noticeType: null, responseDeadlineAt: null },
      }),
    ).toBe(
      'A stored notice may follow N6660426P0205: “Sustainment follow-on” (notice, no deadline stated), same buyer and code.',
    );
    expect(line({ topic: 'govcon.pulse.above-band', key, payload: PULSE })).toBe(
      "FY2026 period 9 (Jun) has $900 obligated so far, above every prior year's $800 for that period (mean $500).",
    );
  });
});
