import {
  agencyOf,
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  compactMoney,
  excerpt,
  GOVCON_TOPICS,
  periodMonthLabel,
  PROMPT_LIMITS,
  type AlertPolicy,
  type GovconAlert,
  type HorizonBody,
  type InteractionPrompt,
  type SearchProfile,
  type SpendingPulse,
} from '@sysdesign/contracts';

import { scopeKey } from '../query';
import type { LensBody } from './lens';

/**
 * The alert rules, as declared arithmetic over what a warm read: no clock,
 * no store — the day and the ids come in as parameters, so the same answers
 * always give the same alerts. The policy is the profile's; the key is what
 * makes an alert the same alert tomorrow.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * One alert per row ending from today through `endingWithinDays` days out. A
 * capped horizon yields only the rows it has; a window of zero yields none.
 */
export function awardEndingAlerts(
  horizon: HorizonBody,
  policy: AlertPolicy,
  profileId: string,
): GovconAlert[] {
  if (policy.endingWithinDays <= 0) return [];
  const key = scopeKey(horizon.scope);
  return horizon.rows.flatMap((row) => {
    const daysLeft = daysBetween(horizon.today, row.endsAt);
    if (daysLeft < 0 || daysLeft > policy.endingWithinDays) return [];
    return [
      {
        topic: GOVCON_TOPICS.awardEnding,
        key: { kind: 'award-ending' as const, scopeKey: key, subject: row.externalId },
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
        scopeKey: key,
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

/** One line a person reads per alert. */
export function describeAlert(alert: GovconAlert): string {
  switch (alert.topic) {
    case GOVCON_TOPICS.awardEnding: {
      const award = alert.payload;
      const who = award.recipientName ?? 'recipient not named';
      const buyer = agencyOf(award.agencyPath) ?? 'agency not named';
      return `${award.piid ?? award.externalId} (${award.family}) ends ${award.endsAt}, in ${award.daysLeft} day(s): ${who}, ${compactMoney(award.amount)} obligated, ${buyer}.`;
    }
    case GOVCON_TOPICS.pulseAboveBand: {
      const pulse = alert.payload;
      return `FY${pulse.fiscalYear} period ${pulse.period} (${periodMonthLabel(pulse.period)}) has ${compactMoney(pulse.total)} obligated so far, above every prior year's ${compactMoney(pulse.high)} for that period (mean ${compactMoney(pulse.expected)}).`;
    }
  }
}

export interface DigestInput {
  /** The prompt's id, minted by the caller. */
  id: string;
  profile: Pick<SearchProfile, 'id' | 'company'>;
  alerts: readonly GovconAlert[];
  now: Date;
}

/**
 * The digest put to a person: the count and the company in the title, at
 * most `ALERT_PROMPT_MAX_ITEMS` lines and a count of the rest, one choice to
 * acknowledge it, expiring after `ALERT_PROMPT_TTL_DAYS`.
 */
export function alertPromptOf({ id, profile, alerts, now }: DigestInput): InteractionPrompt {
  const shown = alerts
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
    details: rest > 0 ? [...shown, `…and ${rest} more on the Spending page.`] : shown,
    choices: [{ id: 'noted', label: 'Noted', note: null }],
    freeText: null,
    commands: [],
    expiresAt: new Date(now.getTime() + ALERT_PROMPT_TTL_DAYS * DAY_MS).toISOString(),
  };
}
