import {
  AWARD_FAMILIES,
  fiscalPeriodOf,
  fiscalYearStart,
  HORIZON_LOOKBACK_YEARS,
  HORIZON_PAGE_SIZE,
  MAX_HORIZON_PAGES,
  MAX_HORIZON_ROWS,
  type HorizonRequest,
  type SpendingHorizon,
  type SpendingScope,
} from '@sysdesign/contracts';

import { bucketHorizon, soonestRows, walkHorizon } from '../horizon';
import type { LensBody, LensSpec } from '../lens';
import { horizonBodySchema } from '../schemas';
import { scopeOf, spend, type LensDeps } from './deps';
import { asOfFrom, resolveAgency } from './shared';

/** The scope, how many months ahead, and the day the walk counts from — so a snapshot is never served for another day. */
export interface HorizonQuery extends SpendingScope {
  months: number;
  today: string;
}

/**
 * What is coming up: the scope's active awards ending inside the coming
 * months, by month and family, with the soonest-ending rows. The source has
 * no period-of-performance filter, so the walk goes newest-ending first over
 * an action-date window of `HORIZON_LOOKBACK_YEARS`, bounded by the page cap
 * and the wall-clock deadline, and says how far it got.
 */
export const horizonLens = (deps: LensDeps): LensSpec<HorizonQuery, LensBody<SpendingHorizon>> => ({
  lens: 'horizon',
  source: deps.sources.ending.id,
  schema: horizonBodySchema,
  disclosures: deps.sources.ending.disclosures,
  async load(query) {
    const agency = await resolveAgency(deps, query.agency);
    if (agency.kind !== 'ok') return agency;
    const scope = scopeOf(query);
    const families = scope.awardFamily === 'both' ? [...AWARD_FAMILIES] : [scope.awardFamily];
    const from = fiscalYearStart(fiscalPeriodOf(query.today).fiscalYear - HORIZON_LOOKBACK_YEARS);
    const tally = { requests: 0 };

    const walk = await walkHorizon(
      {
        families,
        maxPages: MAX_HORIZON_PAGES,
        deadlineMs: deps.deadlineMs,
        now: deps.now,
        page: (family, after, index) => {
          const request: HorizonRequest = {
            naics: scope.naics,
            psc: scope.psc,
            agency: agency.value,
            family,
            from,
            to: query.today,
            limit: HORIZON_PAGE_SIZE,
            page: index + 1,
            after,
          };
          return spend(
            deps,
            tally,
            { source: deps.sources.ending.id, operation: 'horizon', query: request },
            () => deps.sources.ending.page(request),
          );
        },
      },
      query.today,
      query.months,
    );
    if (walk.failure !== null && walk.rows.length === 0) return walk.failure;

    return {
      kind: 'ok',
      body: {
        scope,
        today: query.today,
        months: query.months,
        buckets: bucketHorizon(walk.rows, query.today, query.months),
        rows: soonestRows(walk.rows, MAX_HORIZON_ROWS),
        capped: walk.capped,
        stoppedBy: walk.stoppedBy,
        reachedEndsAt: walk.reachedEndsAt,
      },
      asOf: await asOfFrom(deps),
      requests: tally.requests,
      // A walk the source cut short is answered, not kept: the next read walks again.
      keep: walk.stoppedBy !== 'source',
    };
  },
});
