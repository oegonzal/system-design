import {
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  describeAlert,
  excerpt,
  GOVCON_TOPICS,
  PROMPT_LIMITS,
  type AlertKind,
  type AlertPolicy,
  type AwardBody,
  type GovconAlert,
  type HorizonBody,
  type InteractionPrompt,
  type NoticeRef,
  type SearchProfile,
  type SpendingPulse,
} from '@sysdesign/contracts';

import { scopeKey } from '../query';
import type { LensBody } from './lens';

/**
 * The alert rules, as declared arithmetic over what a warm read: no clock,
 * no store — the day and the ids come in as parameters, so the same answers
 * always give the same alerts. The policy is the profile's; the key — kind
 * and subject — is what makes an alert the same alert tomorrow or in another
 * scope, and the scope it was found in rides in the payload. Two sets of
 * rules: what a scope's lenses show, and what a tracked award's own record
 * shows.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Whether an end falls from that day through the policy's window; a window of zero holds nothing. */
const endsWithin = (daysLeft: number, policy: AlertPolicy): boolean =>
  policy.endingWithinDays > 0 && daysLeft >= 0 && daysLeft <= policy.endingWithinDays;

/**
 * One alert per row a scope's horizon lists ending from today through
 * `endingWithinDays` days out, with at least the policy's floor obligated
 * on it. A capped horizon yields only the rows it has; a policy that
 * raises tracked awards alone yields none here.
 */
export function awardEndingAlerts(
  horizon: HorizonBody,
  policy: AlertPolicy,
  profileId: string,
): GovconAlert[] {
  if (policy.audience !== 'scope') return [];
  const key = scopeKey(horizon.scope);
  return horizon.rows.flatMap((row) => {
    const daysLeft = daysBetween(horizon.today, row.endsAt);
    if (!endsWithin(daysLeft, policy) || row.amount < policy.minObligated) return [];
    return [
      {
        topic: GOVCON_TOPICS.awardEnding,
        key: { kind: 'award-ending' as const, subject: row.externalId },
        payload: {
          profileId,
          scopeKey: key,
          externalId: row.externalId,
          piid: row.piid,
          family: row.family,
          recipientName: row.recipientName,
          agencyPath: row.agencyPath,
          naicsCode: row.naicsCode,
          amount: row.amount,
          endsAt: row.endsAt,
          daysLeft,
        },
      },
    ];
  });
}

/**
 * The period in progress obligating above the projection's high for that
 * period: one alert. None when the policy says so, without a projection,
 * without a partial period, with that period not projected, or with a total
 * inside the band.
 */
export function pulseAboveBandAlerts(
  pulse: LensBody<SpendingPulse>,
  policy: AlertPolicy,
  profileId: string,
): GovconAlert[] {
  if (!policy.pulseAboveBand || pulse.projection === null) return [];
  const partial = pulse.series.find((point) => point.partial);
  if (partial === undefined) return [];
  const projected = pulse.projection.periods.find(
    (period) => period.fiscalYear === partial.fiscalYear && period.period === partial.period,
  );
  if (projected === undefined || partial.total <= projected.high) return [];
  const key = scopeKey(pulse.scope);
  return [
    {
      topic: GOVCON_TOPICS.pulseAboveBand,
      key: {
        kind: 'pulse-above-band' as const,
        subject: `${partial.fiscalYear}-${partial.period}`,
      },
      payload: {
        profileId,
        scopeKey: key,
        fiscalYear: partial.fiscalYear,
        period: partial.period,
        total: partial.total,
        expected: projected.expected,
        high: projected.high,
      },
    },
  ];
}

/** A tracked award as the warm found it: what was last read of its end, its record today, and the open stored notices sharing its NAICS and buyer. */
export interface WatchedAward {
  /** The award's end as the target holds it from the warm before; null when it was never read. */
  lastEndsAt: string | null;
  award: AwardBody;
  openNotices: readonly NoticeRef[];
}

/**
 * What a tracked award's own record says today: that it ends inside the
 * policy's window — whatever is obligated on it, since tracking it is the
 * interest — that its end is no longer the one last read, and each open
 * stored notice that may be its follow-on. An end read for the first time
 * has moved from nothing, and raises nothing.
 */
export function watchedAwardAlerts(
  { lastEndsAt, award, openNotices }: WatchedAward,
  policy: AlertPolicy,
  profileId: string,
  today: string,
): GovconAlert[] {
  const named = {
    profileId,
    externalId: award.externalId,
    piid: award.piid,
    recipientName: award.recipient.name,
    agencyPath: award.agencyPath,
  };
  const alerts: GovconAlert[] = [];
  if (award.endsAt !== null) {
    const daysLeft = daysBetween(today, award.endsAt);
    if (endsWithin(daysLeft, policy)) {
      alerts.push({
        topic: GOVCON_TOPICS.awardEnding,
        key: { kind: 'award-ending', subject: award.externalId },
        payload: {
          ...named,
          scopeKey: null,
          family: award.family,
          naicsCode: award.naicsCode,
          amount: award.obligated,
          endsAt: award.endsAt,
          daysLeft,
        },
      });
    }
    if (lastEndsAt !== null && lastEndsAt !== award.endsAt) {
      alerts.push({
        topic: GOVCON_TOPICS.awardEndMoved,
        key: { kind: 'award-end-moved', subject: `${award.externalId}|${award.endsAt}` },
        payload: { ...named, from: lastEndsAt, to: award.endsAt },
      });
    }
  }
  for (const notice of openNotices) {
    alerts.push({
      topic: GOVCON_TOPICS.awardNotice,
      key: { kind: 'award-notice', subject: `${award.externalId}|${notice.noticeId}` },
      payload: {
        ...named,
        noticeId: notice.noticeId,
        title: notice.title,
        noticeType: notice.noticeType,
        responseDeadlineAt: notice.responseDeadlineAt,
      },
    });
  }
  return alerts;
}

export interface DigestInput {
  /** The prompt's id, minted by the caller. */
  id: string;
  profile: Pick<SearchProfile, 'id' | 'company'>;
  alerts: readonly GovconAlert[];
  now: Date;
}

/**
 * Where each kind of alert stands in the digest: a tracked award's news
 * first, since someone chose to follow it, then a finding about the whole
 * scope, then the ending awards.
 */
const DIGEST_RANK: Record<AlertKind, number> = {
  'award-end-moved': 0,
  'award-notice': 1,
  'pulse-above-band': 2,
  'award-ending': 3,
};

/** What an ending award has obligated on it; nothing for any other finding. */
const obligatedOn = (alert: GovconAlert): number =>
  alert.topic === GOVCON_TOPICS.awardEnding ? alert.payload.amount : 0;

/**
 * The order a person reads alerts in — the digest's, and the ledger's for
 * the alerts of one warm: by kind as ranked above, then the most obligated
 * first, then by subject.
 */
export const byWeight = (a: GovconAlert, b: GovconAlert): number =>
  DIGEST_RANK[a.key.kind] - DIGEST_RANK[b.key.kind] ||
  obligatedOn(b) - obligatedOn(a) ||
  a.key.subject.localeCompare(b.key.subject);

/**
 * The digest put to a person: the count and the company in the title, at
 * most `ALERT_PROMPT_MAX_ITEMS` lines — the weightiest first — and a count
 * of the rest, one choice to acknowledge it, expiring after
 * `ALERT_PROMPT_TTL_DAYS`.
 */
export function alertPromptOf({ id, profile, alerts, now }: DigestInput): InteractionPrompt {
  const shown = [...alerts]
    .sort(byWeight)
    .slice(0, ALERT_PROMPT_MAX_ITEMS)
    .map((alert) => excerpt(describeAlert(alert), PROMPT_LIMITS.detailMaxLength));
  const rest = alerts.length - shown.length;
  return {
    id,
    origin: {
      kind: 'govcon.spending',
      id: profile.id,
      label: excerpt(profile.company, PROMPT_LIMITS.noteMaxLength),
    },
    title: excerpt(
      `${alerts.length} spending alert${alerts.length === 1 ? '' : 's'} for ${profile.company}`,
      PROMPT_LIMITS.titleMaxLength,
    ),
    details: rest > 0 ? [...shown, `…and ${rest} more on the dashboard.`] : shown,
    choices: [{ id: 'noted', label: 'Noted', note: null }],
    freeText: null,
    commands: [],
    expiresAt: new Date(now.getTime() + ALERT_PROMPT_TTL_DAYS * DAY_MS).toISOString(),
  };
}
