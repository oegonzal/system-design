import {
  businessDaysBetween,
  GOVCON_TOPICS,
  isoDateOf,
  TARGET_ACTIVITY_AWAITS_REPLY,
  TARGET_CLOSED_STAGE,
  type AlertPolicy,
  type GovconAlert,
  type TargetActivity,
} from '@sysdesign/contracts';

import type { TargetRecord } from '../ports';
import type { DigestKind } from './digest';

/** What the tracker's alerts are called in the digest a person reads. */
export const TARGETS_DIGEST: DigestKind = {
  origin: 'govcon.targets',
  one: 'quiet target',
  many: 'quiet targets',
};

/** The latest thing logged on a target, by when it happened; null when nothing was. */
const lastActivityOf = (row: TargetRecord): TargetActivity | null =>
  row.activity.reduce<TargetActivity | null>(
    (latest, item) =>
      latest === null || Date.parse(item.at) > Date.parse(latest.at) ? item : latest,
    null,
  );

/**
 * One alert per tracked firm or award still pursued whose latest activity
 * awaits a reply from the other side and is at least the policy's business
 * days old, with no reminder set after it — a reminder says the person has
 * already decided when to follow up. Keyed on the target and that activity,
 * so one spell of quiet nudges once and a logged follow-up re-arms it once.
 * A policy at zero raises none. Pure: the day comes in as a parameter.
 */
export function quietTargetAlerts(
  rows: readonly TargetRecord[],
  policy: AlertPolicy,
  profileId: string,
  today: string,
): GovconAlert[] {
  if (policy.followUpAfterBusinessDays <= 0) return [];
  return rows.flatMap((row) => {
    if (row.stage === TARGET_CLOSED_STAGE) return [];
    const last = lastActivityOf(row);
    if (last === null || !TARGET_ACTIVITY_AWAITS_REPLY[last.kind]) return [];
    if (row.reminderAt !== null && row.reminderAt.getTime() > Date.parse(last.at)) return [];
    const quiet = businessDaysBetween(isoDateOf(Date.parse(last.at)), today);
    if (quiet < policy.followUpAfterBusinessDays) return [];
    return [
      {
        topic: GOVCON_TOPICS.targetQuiet,
        key: { kind: 'target-quiet' as const, subject: `${row.kind}:${row.subject}|${last.at}` },
        payload: {
          profileId,
          kind: row.kind,
          subject: row.subject,
          label: row.label,
          stage: row.stage,
          lastActivityAt: last.at,
          lastActivityKind: last.kind,
          quietBusinessDays: quiet,
          nextAction: row.nextAction,
        },
      },
    ];
  });
}
