import {
  ALERT_PROMPT_MAX_ITEMS,
  ALERT_PROMPT_TTL_DAYS,
  describeAlert,
  excerpt,
  GOVCON_TOPICS,
  PROMPT_LIMITS,
  type AlertKind,
  type GovconAlert,
  type InteractionPrompt,
  type SearchProfile,
} from '@sysdesign/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What one run's alerts are called when they are put to a person: where the
 * prompt says it came from, and the words its title counts them in. Declared
 * beside the rules that find them, so the digest knows no producer.
 */
export interface DigestKind {
  /** The prompt's origin kind. */
  origin: string;
  /** What one of them is called, and several. */
  one: string;
  many: string;
}

export interface DigestInput {
  /** The prompt's id, minted by the caller. */
  id: string;
  profile: Pick<SearchProfile, 'id' | 'company'>;
  alerts: readonly GovconAlert[];
  kind: DigestKind;
  now: Date;
}

/**
 * Where each kind of alert stands in a digest: a tracked award's news
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
 * the alerts of one run: by kind as ranked above, then the most obligated
 * first, then by subject.
 */
export const byWeight = (a: GovconAlert, b: GovconAlert): number =>
  DIGEST_RANK[a.key.kind] - DIGEST_RANK[b.key.kind] ||
  obligatedOn(b) - obligatedOn(a) ||
  a.key.subject.localeCompare(b.key.subject);

/**
 * The digest put to a person: the count, what the alerts are called and the
 * company in the title, at most `ALERT_PROMPT_MAX_ITEMS` lines — the
 * weightiest first — and a count of the rest, one choice to acknowledge it,
 * expiring after `ALERT_PROMPT_TTL_DAYS`.
 */
export function alertPromptOf({ id, profile, alerts, kind, now }: DigestInput): InteractionPrompt {
  const shown = [...alerts]
    .sort(byWeight)
    .slice(0, ALERT_PROMPT_MAX_ITEMS)
    .map((alert) => excerpt(describeAlert(alert), PROMPT_LIMITS.detailMaxLength));
  const rest = alerts.length - shown.length;
  return {
    id,
    origin: {
      kind: kind.origin,
      id: profile.id,
      label: excerpt(profile.company, PROMPT_LIMITS.noteMaxLength),
    },
    title: excerpt(
      `${alerts.length} ${alerts.length === 1 ? kind.one : kind.many} for ${profile.company}`,
      PROMPT_LIMITS.titleMaxLength,
    ),
    details: rest > 0 ? [...shown, `…and ${rest} more on the dashboard.`] : shown,
    choices: [{ id: 'noted', label: 'Noted', note: null }],
    freeText: null,
    commands: [],
    expiresAt: new Date(now.getTime() + ALERT_PROMPT_TTL_DAYS * DAY_MS).toISOString(),
  };
}
