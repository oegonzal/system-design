import {
  BID_STAGES,
  isDueSoonAt,
  type BidPipelineSummary,
  type BidStage,
} from '@sysdesign/contracts';

import type { BidWithNotice } from './ports';

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
    dueSoon: rows.filter(({ bid, opportunity }) =>
      isDueSoonAt([bid.reminderAt?.toISOString() ?? null, opportunity.responseDeadlineAt], nowMs),
    ).length,
    total: rows.length,
  };
}
