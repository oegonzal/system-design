import {
  fiscalYearEnd,
  fiscalYearStart,
  type SeriesRequest,
  type SpendingPulse,
  type SpendingScope,
} from '@sysdesign/contracts';

import type { LensBody, LensSpec } from '../lens';
import { PROJECTION_POLICY, projectFiscalYear } from '../projection';
import { pulseBodySchema } from '../schemas';
import { alignSeries } from '../series';
import { scopeOf, scopeRequestOf, spend, type LensDeps } from './deps';
import { publicationOf, resolveAgency } from './shared';

/** The scope, how many prior years, and the fiscal period the answer is computed in — so a snapshot is never served for another period. */
export interface PulseQuery extends SpendingScope {
  lookback: number;
  fiscalYear: number;
  period: number;
}

/** When the money moves: obligations by fiscal period over the lookback and this year so far, with the rest of the year projected. */
export const pulseLens = (deps: LensDeps): LensSpec<PulseQuery, LensBody<SpendingPulse>> => ({
  lens: 'pulse',
  source: deps.sources.series.id,
  schema: pulseBodySchema,
  disclosures: deps.sources.series.disclosures,
  async load(query) {
    const agency = await resolveAgency(deps, query.agency);
    if (agency.kind !== 'ok') return agency;
    const scope = scopeOf(query);
    const current = { fiscalYear: query.fiscalYear, period: query.period };
    const window = {
      fromFiscalYear: query.fiscalYear - query.lookback,
      toFiscalYear: query.fiscalYear,
    };
    const request: SeriesRequest = {
      ...scopeRequestOf(scope, agency.value),
      awardFamily: scope.awardFamily,
      group: 'month',
      from: fiscalYearStart(window.fromFiscalYear),
      to: fiscalYearEnd(window.toFiscalYear),
    };
    const tally = { requests: 0 };
    const spent = await spend(
      deps,
      tally,
      { source: deps.sources.series.id, operation: 'series', query: request },
      () => deps.sources.series.series(request),
    );
    if (spent.kind !== 'ok') return spent;
    const { asOf, delay } = await publicationOf(deps, scope.agency);
    const series = alignSeries(spent.value, window, current, delay?.completeThrough ?? null);
    return {
      kind: 'ok',
      body: {
        scope,
        fiscalYear: query.fiscalYear,
        series,
        projection: projectFiscalYear(series, current, PROJECTION_POLICY),
        delay,
      },
      asOf,
      requests: tally.requests,
    };
  },
});
