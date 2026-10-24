import { daysUntil, isDueSoonAt, type PipelineRow, type Target } from '@sysdesign/contracts';
import type { BadgeTone } from '@sysdesign/design-system';

import { noticeHref } from '../notice-href';
import { TARGET_KIND_LABEL, targetHref } from '../targets/target-kinds';
import { BID_STAGE_TONE, TARGET_STAGE_TONE } from '../tones';

/** One thing due, whatever it is: a bid on a notice, or a tracked firm or award. */
export interface DueItem {
  key: string;
  /** What it is and where it stands. */
  badge: { label: string; tone: BadgeTone };
  title: string;
  href: string;
  /** When the thing itself wants an answer: a notice's response deadline, an award's end; null for a firm. */
  deadline: string | null;
  reminder: string | null;
  /** What to do next about a tracked firm or award, when one was written; null for a bid. */
  next: string | null;
  /** Days to the nearer of the marks that made it due; null when neither can be counted. */
  left: number | null;
}

/** The nearest of the marks, in days from now; null when none can be counted. */
const nearest = (marks: readonly (string | null)[], nowMs: number): number | null => {
  const days = marks
    .map((mark) => daysUntil(mark, nowMs))
    .filter((left): left is number => left !== null);
  return days.length === 0 ? null : Math.min(...days);
};

/** A tracked notice is due by its reminder or its response deadline. */
const bidItems = (rows: readonly PipelineRow[], nowMs: number): DueItem[] =>
  rows.flatMap(({ bid, lead }) => {
    const marks = [bid.reminderAt, lead.opportunity.responseDeadlineAt];
    if (!isDueSoonAt(marks, nowMs)) return [];
    return [
      {
        key: `bid:${bid.noticeId}`,
        badge: { label: bid.stage, tone: BID_STAGE_TONE[bid.stage] },
        title: lead.opportunity.title,
        href: noticeHref(bid.noticeId),
        deadline: lead.opportunity.responseDeadlineAt,
        reminder: bid.reminderAt,
        next: null,
        left: nearest(marks, nowMs),
      },
    ];
  });

/** A target is due by its reminder alone, as the service counts it; an award's end is shown, not counted. */
const targetItems = (targets: readonly Target[], nowMs: number): DueItem[] =>
  targets.flatMap((target) => {
    if (!isDueSoonAt([target.reminderAt], nowMs)) return [];
    return [
      {
        key: `target:${target.kind}:${target.subject}`,
        badge: {
          label: `${TARGET_KIND_LABEL[target.kind]} · ${target.stage}`,
          tone: TARGET_STAGE_TONE[target.stage],
        },
        title: target.label,
        href: targetHref(target),
        deadline: target.endsAt,
        reminder: target.reminderAt,
        next: target.nextAction.length > 0 ? target.nextAction : null,
        left: nearest([target.reminderAt], nowMs),
      },
    ];
  });

/**
 * Everything due inside the week, bids and targets in one list — what to do
 * first, whatever it is — the soonest mark first, an uncountable one last.
 */
export const dueItemsOf = (
  rows: readonly PipelineRow[],
  targets: readonly Target[],
  nowMs: number,
): DueItem[] =>
  [...bidItems(rows, nowMs), ...targetItems(targets, nowMs)].sort(
    (a, b) =>
      (a.left ?? Number.POSITIVE_INFINITY) - (b.left ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title),
  );
