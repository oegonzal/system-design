import {
  describeQuery,
  type OpportunityQuery,
  type PullStop,
  type SliceOutcome,
  type SliceReport,
} from '@sysdesign/contracts';

import type { Gated } from './budget';
import type { SearchPage, UpsertSummary } from './ports';
import { nextPage } from './query';

/** One slice of a plan: a first page, and the saved search it runs — by id and by name — when it is one. */
export interface PlannedSlice {
  searchId: string | null;
  name: string | null;
  query: OpportunityQuery;
}

/** One slice as it ran: its report, and the ids of the notices its pages carried — what a yield is counted over. */
export interface SliceRun {
  slice: PlannedSlice;
  report: SliceReport;
  noticeIds: string[];
}

export interface PullDeps {
  maxPagesPerSlice: number;
  /** Wall-clock budget for the whole pull; no slice starts after it. */
  deadlineMs: number;
  now: () => Date;
  search(query: OpportunityQuery): Promise<Gated<SearchPage>>;
  store(
    opportunities: readonly SearchPage['opportunities'][number][],
    seenAt: Date,
  ): Promise<UpsertSummary>;
  warn(message: string): void;
}

export interface PullOutcome {
  /** Every planned slice, in the plan's order. */
  runs: SliceRun[];
  stoppedBy: PullStop | null;
}

const sliceReport = (
  slice: PlannedSlice,
  outcome: SliceOutcome,
  detail: string | null,
): SliceReport => ({
  name: slice.name,
  query: slice.query,
  outcome,
  pages: 0,
  received: 0,
  inserted: 0,
  updated: 0,
  rejected: 0,
  truncated: false,
  detail,
});

/**
 * A pull, as pure orchestration over the gate: every slice in order, paging
 * while the report is under `maxPagesPerSlice`, storing what normalized.
 * Three things end it early and name themselves in every later slice — a
 * spent budget, a rate limit (never retried), and the wall-clock deadline.
 * A failure after a page is stored marks the slice `error` and `truncated`:
 * what came in stayed, what did not is said.
 */
export async function runPull(plan: readonly PlannedSlice[], deps: PullDeps): Promise<PullOutcome> {
  const startedAt = deps.now();
  const seenAt = startedAt;
  const runs: SliceRun[] = [];
  let stoppedBy: PullStop | null = null;

  for (const slice of plan) {
    if (stoppedBy === null && deps.now().getTime() - startedAt.getTime() >= deps.deadlineMs) {
      stoppedBy = 'deadline';
    }
    if (stoppedBy !== null) {
      runs.push({
        slice,
        report: sliceReport(slice, 'skipped', `stopped earlier: ${stoppedBy}`),
        noticeIds: [],
      });
      continue;
    }
    const report = sliceReport(slice, 'ok', null);
    const noticeIds: string[] = [];
    let query = slice.query;
    for (let page = 0; page < deps.maxPagesPerSlice; page += 1) {
      const result = await deps.search(query);
      if (result.kind === 'ok') {
        const { opportunities, rejected, totalRecords } = result.value;
        report.pages += 1;
        report.received += opportunities.length + rejected.length;
        report.rejected += rejected.length;
        noticeIds.push(...opportunities.map((opportunity) => opportunity.noticeId));
        const summary = await deps.store(opportunities, seenAt);
        report.inserted += summary.inserted;
        report.updated += summary.updated;
        const fetched = query.offset + opportunities.length + rejected.length;
        if (fetched >= totalRecords || opportunities.length + rejected.length === 0) break;
        if (page + 1 < deps.maxPagesPerSlice) {
          query = nextPage(query);
          continue;
        }
        report.truncated = true;
        report.detail = `${totalRecords - fetched} more record(s) beyond maxPagesPerSlice`;
        break;
      }
      if (result.kind === 'cached') {
        if (report.pages === 0) report.outcome = 'cached';
        report.detail = `pulled ${result.requestedAt}${
          result.recordCount === null ? '' : `, ${result.recordCount} record(s)`
        }`;
        break;
      }
      if (result.kind === 'budget-exhausted') {
        if (report.pages === 0) report.outcome = 'budget-exhausted';
        else report.truncated = true;
        report.detail = `budget ${result.spent}/${result.budget} spent`;
        stoppedBy = 'budget';
        break;
      }
      report.outcome = 'error';
      report.truncated = report.pages > 0;
      report.detail = `${result.outcome}: ${result.message}`;
      if (result.outcome === 'rate-limited') stoppedBy = 'rate-limited';
      deps.warn(`slice ${describeQuery(query)} failed — ${report.detail}`);
      break;
    }
    runs.push({ slice, report, noticeIds });
  }

  return { runs, stoppedBy };
}
