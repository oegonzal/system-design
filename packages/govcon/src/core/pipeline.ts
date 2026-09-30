import {
  BID_STAGES,
  DUE_SOON_DAYS,
  type BidPipelineSummary,
  type BidStage,
} from '@sysdesign/contracts';

import type { BidWithNotice } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the bid's reminder or the notice's deadline falls inside `DUE_SOON_DAYS` of `nowMs` (or has passed). */
export function isDueSoon({ bid, opportunity }: BidWithNotice, nowMs: number): boolean {
  const until = nowMs + DUE_SOON_DAYS * DAY_MS;
  const marks = [
    bid.reminderAt?.getTime() ?? null,
    opportunity.responseDeadlineAt === null ? null : Date.parse(opportunity.responseDeadlineAt),
  ];
  return marks.some((mark) => mark !== null && !Number.isNaN(mark) && mark <= until);
}

/** The pipeline counted: every stage (zero included), what is due soon, the total. */
export function summarizePipeline(
  rows: readonly BidWithNotice[],
  nowMs: number,
): BidPipelineSummary {
  const byStage = Object.fromEntries(BID_STAGES.map((stage) => [stage, 0])) as Record<
    BidStage,
    number
  >;
  for (const row of rows) byStage[row.bid.stage] += 1;
  return {
    byStage,
    dueSoon: rows.filter((row) => isDueSoon(row, nowMs)).length,
    total: rows.length,
  };
}
