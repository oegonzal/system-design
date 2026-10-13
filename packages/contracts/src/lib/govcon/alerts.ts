import { z } from 'zod';

import { FISCAL_PERIODS } from './fiscal';
import { AWARD_FAMILIES } from './vocab';

/**
 * What govcon's spending warm found worth a person's attention, as declared
 * topics on the notifications bus: an award in the profile's codes ending
 * soon, a fiscal period obligating above its projection's band. Each event
 * carries the profile it was found for and the key that makes it the same
 * alert tomorrow, so whoever keeps a record — govcon's own ledger first —
 * raises it once. The digest a person reads is a separate prompt; these are
 * the record.
 */
export const GOVCON_TOPICS = {
  awardEnding: 'govcon.award.ending',
  pulseAboveBand: 'govcon.pulse.above-band',
} as const;

export const ALERT_KINDS = ['award-ending', 'pulse-above-band'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** What makes one alert the same alert the next day: its kind, the scope it was computed in (a hash), and its subject — an award's id, a fiscal period. */
export interface AlertKey {
  kind: AlertKind;
  scopeKey: string;
  subject: string;
}

/** The key as one string, the way a ledger spells it. */
export const alertKeyOf = (key: AlertKey): string => `${key.kind}:${key.scopeKey}:${key.subject}`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const alertBase = {
  profileId: z.string().min(1),
  /** sha256 hex of the scope the alert was computed in. */
  scopeKey: z.string().length(64),
};

export const awardEndingSchema = z.strictObject({
  ...alertBase,
  externalId: z.string().min(1),
  piid: z.string().nullable(),
  family: z.enum(AWARD_FAMILIES),
  recipientName: z.string().nullable(),
  agencyPath: z.string().nullable(),
  naicsCode: z.string().nullable(),
  /** Obligated so far on the award. */
  amount: z.number().finite(),
  endsAt: isoDate,
  daysLeft: z.number().int().min(0),
});
export type AwardEndingAlert = z.infer<typeof awardEndingSchema>;

export const pulseAboveBandSchema = z.strictObject({
  ...alertBase,
  fiscalYear: z.number().int(),
  period: z.number().int().min(1).max(FISCAL_PERIODS),
  /** Obligated so far in the period in progress. */
  total: z.number().finite(),
  /** The projection's mean for that period, and the highest prior year. */
  expected: z.number().finite(),
  high: z.number().finite(),
});
export type PulseAboveBandAlert = z.infer<typeof pulseAboveBandSchema>;

/** One alert as the warm raises it: its topic, its key, and the payload that topic's schema declares. */
export type GovconAlert =
  | { topic: typeof GOVCON_TOPICS.awardEnding; key: AlertKey; payload: AwardEndingAlert }
  | { topic: typeof GOVCON_TOPICS.pulseAboveBand; key: AlertKey; payload: PulseAboveBandAlert };
