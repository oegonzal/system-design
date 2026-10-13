import { NOTIFICATION_TOPICS } from '../notifications/topics';
import { alertKeyOf, awardEndingSchema, GOVCON_TOPICS, pulseAboveBandSchema } from './alerts';

const SCOPE_KEY = 'a'.repeat(64);
const AWARD = {
  profileId: 'enfav',
  scopeKey: SCOPE_KEY,
  externalId: 'CONT_AWD_1',
  piid: 'N6660426P0205',
  family: 'contracts',
  recipientName: 'Acme',
  agencyPath: 'Department of Defense.Department of the Navy',
  naicsCode: '332710',
  amount: 1000,
  endsAt: '2026-08-01',
  daysLeft: 47,
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
  it('[GOV-24] declares both topics on the bus for anyone to publish, each with the payload the warm publishes, refuses a payload beside it, and spells one key per kind, scope and subject', () => {
    for (const topic of Object.values(GOVCON_TOPICS)) {
      expect(NOTIFICATION_TOPICS[topic]?.publishedBy).toBe('anyone');
    }
    expect(awardEndingSchema.parse(AWARD)).toEqual(AWARD);
    expect(awardEndingSchema.safeParse({ ...AWARD, daysLeft: -1 }).success).toBe(false);
    expect(awardEndingSchema.safeParse({ ...AWARD, scopeKey: 'short' }).success).toBe(false);
    expect(awardEndingSchema.safeParse({ ...AWARD, extra: true }).success).toBe(false);
    expect(pulseAboveBandSchema.parse(PULSE)).toEqual(PULSE);
    expect(pulseAboveBandSchema.safeParse({ ...PULSE, period: 13 }).success).toBe(false);
    expect(alertKeyOf({ kind: 'award-ending', scopeKey: SCOPE_KEY, subject: 'CONT_AWD_1' })).toBe(
      `award-ending:${SCOPE_KEY}:CONT_AWD_1`,
    );
  });
});
