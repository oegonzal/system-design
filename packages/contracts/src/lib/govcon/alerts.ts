import { z } from 'zod';

import type { ApiListResponse } from '../envelope';
import { FISCAL_PERIODS, periodMonthLabel } from './fiscal';
import { agencyOf, compactMoney, day } from './format';
import {
  AWARD_FAMILIES,
  LEAD_TIERS,
  TARGET_ACTIVITY_KINDS,
  TARGET_KINDS,
  type TargetActivityKind,
} from './vocab';

/**
 * What govcon found worth a person's attention, as declared topics on the
 * notifications bus. From the daily warm: an award ending soon, a tracked
 * award whose end moved, a stored notice that may be a tracked award's
 * follow-on, a fiscal period obligating above its projection's band. After
 * the daily pull: a stored notice the profile ranks high enough to hear
 * about. From the warm too: a tracked firm or award left quiet after an
 * outreach for the profile's business days. Each event carries the profile it was found for and the key that
 * makes it the same alert tomorrow, so whoever keeps a record — govcon's own
 * ledger first — raises it once. The digest a person reads is a separate
 * prompt; these are the record.
 */
export const GOVCON_TOPICS = {
  awardEnding: 'govcon.award.ending',
  awardEndMoved: 'govcon.award.end-moved',
  awardNotice: 'govcon.award.notice',
  pulseAboveBand: 'govcon.pulse.above-band',
  leadNew: 'govcon.lead.new',
  targetQuiet: 'govcon.target.quiet',
} as const;

export const ALERT_KINDS = [
  'award-ending',
  'award-end-moved',
  'award-notice',
  'pulse-above-band',
  'lead-new',
  'target-quiet',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * What makes one alert the same alert tomorrow, or in another scope: its kind
 * and its subject — an award's id, an award and the day its end moved to, an
 * award and a notice, a fiscal period, a notice's id, a target and the
 * outreach it has been quiet since. The scope it was found
 * in travels in the payload, not the key, so an award seen through two scopes
 * is one alert to the person who reads the digest.
 */
export interface AlertKey {
  kind: AlertKind;
  subject: string;
}

/** The key as one string, the way a ledger spells it. */
export const alertKeyOf = (key: AlertKey): string => `${key.kind}:${key.subject}`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const profileId = z.string().min(1);
/** sha256 hex of the scope an alert was computed in. */
const scopeKey = z.string().length(64);
/** The award an alert is about, as a person would recognise it. */
const award = {
  externalId: z.string().min(1),
  piid: z.string().nullable(),
  recipientName: z.string().nullable(),
  agencyPath: z.string().nullable(),
};

export const awardEndingSchema = z.strictObject({
  profileId,
  /** Null for an award raised because it is tracked, not because a scope listed it. */
  scopeKey: scopeKey.nullable(),
  ...award,
  family: z.enum(AWARD_FAMILIES),
  naicsCode: z.string().nullable(),
  /** Obligated so far on the award. */
  amount: z.number().finite(),
  endsAt: isoDate,
  daysLeft: z.number().int().min(0),
});
export type AwardEndingAlert = z.infer<typeof awardEndingSchema>;

/** A tracked award whose end is no longer the one last read: an option exercised, an extension, a cut. */
export const awardEndMovedSchema = z.strictObject({
  profileId,
  ...award,
  from: isoDate,
  to: isoDate,
});
export type AwardEndMovedAlert = z.infer<typeof awardEndMovedSchema>;

/** A stored open notice sharing a tracked award's NAICS and buyer: a candidate for its follow-on. */
export const awardNoticeSchema = z.strictObject({
  profileId,
  ...award,
  noticeId: z.string().min(1),
  title: z.string(),
  noticeType: z.string().nullable(),
  /** ISO 8601, when the notice states one. */
  responseDeadlineAt: z.string().nullable(),
});
export type AwardNoticeAlert = z.infer<typeof awardNoticeSchema>;

export const pulseAboveBandSchema = z.strictObject({
  profileId,
  scopeKey,
  fiscalYear: z.number().int(),
  period: z.number().int().min(1).max(FISCAL_PERIODS),
  /** Obligated so far in the period in progress. */
  total: z.number().finite(),
  /** The projection's mean for that period, and the highest prior year. */
  expected: z.number().finite(),
  high: z.number().finite(),
});
export type PulseAboveBandAlert = z.infer<typeof pulseAboveBandSchema>;

/** A stored notice the profile ranks in the tier it asks to hear about, or a better one: raised once per notice. */
export const leadNewSchema = z.strictObject({
  profileId,
  noticeId: z.string().min(1),
  title: z.string(),
  noticeType: z.string().nullable(),
  agencyPath: z.string().nullable(),
  naicsCode: z.string().nullable(),
  /** ISO 8601, when the notice states one. */
  responseDeadlineAt: z.string().nullable(),
  /** The profile's score for it when it was raised, and the tier that score fell in. */
  score: z.number().finite(),
  tier: z.enum(LEAD_TIERS),
});
export type LeadNewAlert = z.infer<typeof leadNewSchema>;

/** A tracked firm or award whose last activity awaits a reply and has for the profile's business days: raised once per outreach. */
export const targetQuietSchema = z.strictObject({
  profileId,
  kind: z.enum(TARGET_KINDS),
  subject: z.string().min(1),
  label: z.string(),
  stage: z.string().min(1),
  /** ISO 8601: the activity the silence is counted from, and what it was. */
  lastActivityAt: z.iso.datetime({ offset: true }),
  lastActivityKind: z.enum(TARGET_ACTIVITY_KINDS),
  quietBusinessDays: z.number().int().min(0),
  nextAction: z.string(),
});
export type TargetQuietAlert = z.infer<typeof targetQuietSchema>;

/** One alert as it is raised: its topic, its key, and the payload that topic's schema declares. */
export type GovconAlert =
  | { topic: typeof GOVCON_TOPICS.awardEnding; key: AlertKey; payload: AwardEndingAlert }
  | { topic: typeof GOVCON_TOPICS.awardEndMoved; key: AlertKey; payload: AwardEndMovedAlert }
  | { topic: typeof GOVCON_TOPICS.awardNotice; key: AlertKey; payload: AwardNoticeAlert }
  | { topic: typeof GOVCON_TOPICS.pulseAboveBand; key: AlertKey; payload: PulseAboveBandAlert }
  | { topic: typeof GOVCON_TOPICS.leadNew; key: AlertKey; payload: LeadNewAlert }
  | { topic: typeof GOVCON_TOPICS.targetQuiet; key: AlertKey; payload: TargetQuietAlert };

/** The alert published on one topic. */
type AlertOn<T extends GovconAlert['topic']> = Extract<GovconAlert, { topic: T }>;

interface AlertDeclaration {
  topic: GovconAlert['topic'];
  schema: z.ZodType;
  /** The stored payload as the alert it was, or null when its schema refuses it. */
  read(key: AlertKey, payload: unknown): GovconAlert | null;
}

/** One kind's declaration from its topic and that topic's schema: a payload the schema refuses reads as no alert. */
const declared = <T extends GovconAlert['topic']>(
  topic: T,
  schema: z.ZodType<AlertOn<T>['payload']>,
): AlertDeclaration => ({
  topic,
  schema,
  read: (key, payload) => {
    const parsed = schema.safeParse(payload);
    return parsed.success ? ({ topic, key, payload: parsed.data } as AlertOn<T>) : null;
  },
});

/**
 * Every kind of alert, declared once: the topic it is published on, the
 * payload that topic carries, and how a stored payload is read back as the
 * alert it was. The bus's registry, the ledger's reader and the line a person
 * reads are all driven by this table, so a new kind is one row and one
 * member of the union above.
 */
export const ALERT_DECLARATIONS: Record<AlertKind, AlertDeclaration> = {
  'award-ending': declared(GOVCON_TOPICS.awardEnding, awardEndingSchema),
  'award-end-moved': declared(GOVCON_TOPICS.awardEndMoved, awardEndMovedSchema),
  'award-notice': declared(GOVCON_TOPICS.awardNotice, awardNoticeSchema),
  'pulse-above-band': declared(GOVCON_TOPICS.pulseAboveBand, pulseAboveBandSchema),
  'lead-new': declared(GOVCON_TOPICS.leadNew, leadNewSchema),
  'target-quiet': declared(GOVCON_TOPICS.targetQuiet, targetQuietSchema),
};

/** How a line names the outreach a target has been quiet since. */
const ACTIVITY_PHRASE: Record<TargetActivityKind, string> = {
  registered: 'you registered',
  emailed: 'you emailed',
  called: 'you called',
  met: 'you met',
  replied: 'they replied',
};

/** How an award is named in a line: its PIID, or the source's id when it has none. */
const awardName = (payload: { piid: string | null; externalId: string }): string =>
  payload.piid ?? payload.externalId;

/** When a notice wants its answer, as a line says it. */
const dueOf = (responseDeadlineAt: string | null): string =>
  responseDeadlineAt === null ? 'no deadline stated' : `due ${day(responseDeadlineAt)}`;

/** One line a person reads per alert — the digest's, and the list's. */
export function describeAlert(alert: GovconAlert): string {
  switch (alert.topic) {
    case GOVCON_TOPICS.awardEnding: {
      const ending = alert.payload;
      const who = ending.recipientName ?? 'recipient not named';
      const buyer = agencyOf(ending.agencyPath) ?? 'agency not named';
      return `${awardName(ending)} (${ending.family}) ends ${ending.endsAt}, in ${ending.daysLeft} day(s): ${who}, ${compactMoney(ending.amount)} obligated, ${buyer}.`;
    }
    case GOVCON_TOPICS.awardEndMoved: {
      const moved = alert.payload;
      const who = moved.recipientName ?? 'recipient not named';
      return `${awardName(moved)} now ends ${moved.to}, not ${moved.from}: ${who}. ${moved.to > moved.from ? 'It was extended, so its follow-on is further off.' : 'It was cut short.'}`;
    }
    case GOVCON_TOPICS.awardNotice: {
      const found = alert.payload;
      return `A stored notice may follow ${awardName(found)}: “${found.title}” (${found.noticeType ?? 'notice'}, ${dueOf(found.responseDeadlineAt)}), same buyer and code.`;
    }
    case GOVCON_TOPICS.pulseAboveBand: {
      const pulse = alert.payload;
      return `FY${pulse.fiscalYear} period ${pulse.period} (${periodMonthLabel(pulse.period)}) has ${compactMoney(pulse.total)} obligated so far, above every prior year's ${compactMoney(pulse.high)} for that period (mean ${compactMoney(pulse.expected)}).`;
    }
    case GOVCON_TOPICS.leadNew: {
      const lead = alert.payload;
      const buyer = agencyOf(lead.agencyPath) ?? 'agency not named';
      return `New ${lead.tier} lead, scored ${lead.score}: “${lead.title}” (${lead.noticeType ?? 'notice'}, ${dueOf(lead.responseDeadlineAt)}), ${buyer}.`;
    }
    case GOVCON_TOPICS.targetQuiet: {
      const quiet = alert.payload;
      const next =
        quiet.nextAction.length > 0 ? quiet.nextAction.replace(/[.\s]+$/, '') : 'none set';
      return `${quiet.label} (${quiet.kind}, ${quiet.stage}) has been quiet ${quiet.quietBusinessDays} business day(s) since ${ACTIVITY_PHRASE[quiet.lastActivityKind]} on ${day(quiet.lastActivityAt)}. Next: ${next}. One concise follow-up, then move on.`;
    }
  }
}

/** One alert as the ledger kept it, for a person to read back. */
export interface RaisedAlertView {
  id: string;
  key: AlertKey;
  profileId: string;
  /** ISO 8601. */
  raisedAt: string;
  /** The alert as it was published; null for one raised before the ledger kept payloads. */
  alert: GovconAlert | null;
}

export interface ListAlertsQuery {
  limit?: number;
  offset?: number;
}

export type ListAlertsResponse = ApiListResponse<RaisedAlertView>;
