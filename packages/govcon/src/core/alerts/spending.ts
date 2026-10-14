import {
  GOVCON_TOPICS,
  type AlertPolicy,
  type AwardBody,
  type GovconAlert,
  type HorizonBody,
  type NoticeRef,
  type SpendingPulse,
} from '@sysdesign/contracts';

import { scopeKey } from '../query';
import type { LensBody } from '../spending/lens';
import type { DigestKind } from './digest';

/**
 * The spending warm's alert rules, as declared arithmetic over what a warm
 * read: no clock, no store — the day and the ids come in as parameters, so
 * the same answers always give the same alerts. The policy is the profile's;
 * the key — kind and subject — is what makes an alert the same alert
 * tomorrow or in another scope, and the scope it was found in rides in the
 * payload. Two sets of rules: what a scope's lenses show, and what a tracked
 * award's own record shows.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the warm's alerts are called in the digest a person reads. */
export const SPENDING_DIGEST: DigestKind = {
  origin: 'govcon.spending',
  one: 'spending alert',
  many: 'spending alerts',
};

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
