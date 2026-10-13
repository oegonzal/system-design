import type {
  CountRequest,
  ReachBand,
  ReachCut,
  SeriesRequest,
  SpendingFacets,
  SpendingReach,
  SpendingScope,
} from '@sysdesign/contracts';

import type { LensBody, LensSpec } from '../lens';
import { reachBands, reachCuts } from '../reach';
import { reachBodySchema } from '../schemas';
import { scopeRequestOf, spend, type LensDeps, type Spent } from './deps';
import { delayOver, publicationOf, resolveAgency } from './shared';

/**
 * The scope without a family — reach counts contracts, since a vehicle is
 * not work until an order is placed under it — the window, and the
 * set-aside lanes to count for.
 */
export interface ReachQuery extends Omit<SpendingScope, 'awardFamily'> {
  /** ISO dates, inclusive, on the action date. */
  from: string;
  to: string;
  lanes: string[];
}

/**
 * How much of a scope's new work was open to a firm as it stands: the
 * scope's new contracts over a window, cut down step by step — each cut one
 * count and one total — and the last cut by award size. A cut the scope's
 * own facets rule out is answered as nothing without a request.
 */
export const reachLens = (deps: LensDeps): LensSpec<ReachQuery, LensBody<SpendingReach>> => ({
  lens: 'reach',
  source: deps.sources.counts.id,
  schema: reachBodySchema,
  disclosures: deps.sources.counts.disclosures,
  async load(query) {
    const agency = await resolveAgency(deps, query.agency);
    if (agency.kind !== 'ok') return agency;
    const scope: SpendingScope = {
      naics: query.naics,
      psc: query.psc,
      agency: query.agency,
      awardFamily: 'contracts',
      facets: query.facets,
    };
    const tally = { requests: 0 };
    const window = { awardFamily: scope.awardFamily, from: query.from, to: query.to };
    const under = (facets: SpendingFacets) => ({
      ...scopeRequestOf({ ...scope, facets }, agency.value),
      ...window,
    });

    const awardsUnder = async (facets: SpendingFacets): Promise<Spent<number>> => {
      const request: CountRequest = under(facets);
      const counted = await spend(
        deps,
        tally,
        { source: deps.sources.counts.id, operation: 'award-count', query: request },
        () => deps.sources.counts.count(request),
      );
      return counted.kind === 'ok'
        ? { kind: 'ok', value: counted.value.contracts + counted.value.idvs }
        : counted;
    };
    const amountUnder = async (facets: SpendingFacets): Promise<Spent<number>> => {
      const request: SeriesRequest = { ...under(facets), group: 'fiscal_year' };
      const totals = await spend(
        deps,
        tally,
        { source: deps.sources.series.id, operation: 'series', query: request },
        () => deps.sources.series.series(request),
      );
      return totals.kind === 'ok'
        ? { kind: 'ok', value: totals.value.reduce((sum, point) => sum + point.total, 0) }
        : totals;
    };

    const planned = reachCuts(scope.facets, query.lanes);
    const cuts: ReachCut[] = [];
    for (const cut of planned) {
      if (cut.facets === null) {
        cuts.push({ ...cut, awards: 0, amount: 0 });
        continue;
      }
      const awards = await awardsUnder(cut.facets);
      if (awards.kind !== 'ok') return awards;
      const amount = await amountUnder(cut.facets);
      if (amount.kind !== 'ok') return amount;
      cuts.push({ ...cut, awards: awards.value, amount: amount.value });
    }

    const bands: ReachBand[] = [];
    for (const band of reachBands(planned.at(-1)?.facets ?? null)) {
      if (band.facets === null) {
        bands.push({ id: band.id, awards: 0 });
        continue;
      }
      const awards = await awardsUnder(band.facets);
      if (awards.kind !== 'ok') return awards;
      bands.push({ id: band.id, awards: awards.value });
    }

    const { asOf, delay } = await publicationOf(deps, scope.agency);
    return {
      kind: 'ok',
      body: {
        scope,
        from: query.from,
        to: query.to,
        lanes: query.lanes,
        cuts,
        bands,
        delay: delayOver(delay, query.to),
      },
      asOf,
      requests: tally.requests,
    };
  },
});
