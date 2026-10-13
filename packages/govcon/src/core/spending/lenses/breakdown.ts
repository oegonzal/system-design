import {
  MAX_BREAKDOWN_ROWS,
  type BreakdownCategory,
  type BreakdownRequest,
  type SeriesRequest,
  type SpendingBreakdown,
  type SpendingScope,
} from '@sysdesign/contracts';

import type { LensBody, LensSpec } from '../lens';
import { breakdownBodySchema } from '../schemas';
import { scopeOf, scopeRequestOf, spend, type LensDeps } from './deps';
import { delayOver, publicationOf, resolveAgency } from './shared';

export interface BreakdownQuery extends SpendingScope {
  category: BreakdownCategory;
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
}

/**
 * Where the money goes: the scope's obligations over a window, ranked by one
 * category. Two calls — the ranked rows, and the scope's own total over the
 * same window — so every share divides by the whole and the rows need not
 * add up to it. A window that reaches past what an agency in the scope has
 * published says so.
 */
export const breakdownLens = (
  deps: LensDeps,
): LensSpec<BreakdownQuery, LensBody<SpendingBreakdown>> => ({
  lens: 'breakdown',
  source: deps.sources.breakdowns.id,
  schema: breakdownBodySchema,
  disclosures: deps.sources.breakdowns.disclosures,
  async load(query) {
    const agency = await resolveAgency(deps, query.agency);
    if (agency.kind !== 'ok') return agency;
    const scope = scopeOf(query);
    const tally = { requests: 0 };

    const rowsRequest: BreakdownRequest = {
      ...scopeRequestOf(scope, agency.value),
      awardFamily: scope.awardFamily,
      category: query.category,
      from: query.from,
      to: query.to,
      limit: MAX_BREAKDOWN_ROWS,
      page: 1,
    };
    const rows = await spend(
      deps,
      tally,
      { source: deps.sources.breakdowns.id, operation: 'breakdown', query: rowsRequest },
      () => deps.sources.breakdowns.breakdown(rowsRequest),
    );
    if (rows.kind !== 'ok') return rows;

    const totalRequest: SeriesRequest = {
      ...scopeRequestOf(scope, agency.value),
      awardFamily: scope.awardFamily,
      group: 'fiscal_year',
      from: query.from,
      to: query.to,
    };
    const totals = await spend(
      deps,
      tally,
      { source: deps.sources.series.id, operation: 'series', query: totalRequest },
      () => deps.sources.series.series(totalRequest),
    );
    if (totals.kind !== 'ok') return totals;

    const total = totals.value.reduce((sum, point) => sum + point.total, 0);
    const { asOf, delay } = await publicationOf(deps, scope.agency);
    return {
      kind: 'ok',
      body: {
        scope,
        category: query.category,
        from: query.from,
        to: query.to,
        total,
        rows: rows.value.rows.map((row) => ({
          ...row,
          share: total > 0 ? row.amount / total : 0,
        })),
        truncated: rows.value.hasMore,
        delay: delayOver(delay, query.to),
      },
      asOf,
      requests: tally.requests,
    };
  },
});
