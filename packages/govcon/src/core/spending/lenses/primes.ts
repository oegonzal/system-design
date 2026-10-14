import {
  MAX_SUBAWARD_PAGES,
  PRIME_OBLIGATION_ROWS,
  PRIMES_LISTED,
  SUBAWARD_PAGE_SIZE,
  SUBCONTRACTORS_LISTED,
  type AmountRange,
  type BreakdownRequest,
  type SpendingPrimes,
  type SpendingScope,
  type SubawardScopeRequest,
  type SubawardsRequest,
} from '@sysdesign/contracts';

import type { SubcontractRow } from '../../ports';
import type { LensBody, LensSpec } from '../lens';
import { obligationsByUei, rankPrimes, uniqueSubcontracts, withoutFacets } from '../primes';
import { primesBodySchema } from '../schemas';
import { scopeOf, scopeRequestOf, spend, type LensDeps } from './deps';
import { asOfFrom, resolveAgency } from './shared';

/** The scope, a window of subcontract dates, and the size of subcontract counted. */
export interface PrimesQuery extends SpendingScope {
  /** ISO dates, inclusive, on the subcontract's date. */
  from: string;
  to: string;
  band: AmountRange | null;
}

/**
 * Who passes work down: the scope's primes ranked by the subcontracts they
 * reported. One count of what the source holds, then its rows read most
 * recent first up to a page bound and the wall-clock deadline, repeats
 * removed, grouped by the prime's own identity — and one read of the
 * scope's largest recipients, so each prime also says what it holds itself.
 * A facet a subcontract search cannot honour is unset, and the answer's
 * scope says so; the answer also says how far back the rows reached. Rows
 * the source cut short are answered and not kept.
 */
export const primesLens = (deps: LensDeps): LensSpec<PrimesQuery, LensBody<SpendingPrimes>> => ({
  lens: 'primes',
  source: deps.sources.subcontracts.id,
  schema: primesBodySchema,
  disclosures: deps.sources.subcontracts.disclosures,
  async load(query) {
    const agency = await resolveAgency(deps, query.agency);
    if (agency.kind !== 'ok') return agency;
    const asked = scopeOf(query);
    const scope: SpendingScope = {
      ...asked,
      facets: withoutFacets(asked.facets, deps.sources.subcontracts.unsupportedFacets),
    };
    const tally = { requests: 0 };
    const window: SubawardScopeRequest = {
      ...scopeRequestOf(scope, agency.value),
      from: query.from,
      to: query.to,
      band: query.band,
    };

    const total = await spend(
      deps,
      tally,
      { source: deps.sources.subcontracts.id, operation: 'subaward-count', query: window },
      () => deps.sources.subcontracts.count(window),
    );
    if (total.kind !== 'ok') return total;

    const startedAt = deps.now().getTime();
    const rows: SubcontractRow[] = [];
    let cutShort = false;
    let more = total.value > 0;
    for (let page = 1; more && page <= MAX_SUBAWARD_PAGES; page += 1) {
      if (deps.now().getTime() - startedAt >= deps.deadlineMs) break;
      const request: SubawardsRequest = { ...window, limit: SUBAWARD_PAGE_SIZE, page };
      const read = await spend(
        deps,
        tally,
        { source: deps.sources.subcontracts.id, operation: 'subawards', query: request },
        () => deps.sources.subcontracts.page(request),
      );
      if (read.kind !== 'ok') {
        // Refused before any row: the refusal is the answer. After some: what was read is, uncached.
        if (rows.length === 0) return read;
        cutShort = true;
        break;
      }
      rows.push(...read.value.rows);
      more = read.value.hasMore;
    }

    // What each firm holds itself, over the same window: the scope's largest recipients as primes.
    const holders: BreakdownRequest = {
      ...scopeRequestOf(scope, agency.value),
      awardFamily: scope.awardFamily,
      category: 'recipient',
      from: query.from,
      to: query.to,
      limit: PRIME_OBLIGATION_ROWS,
      page: 1,
    };
    const held = await spend(
      deps,
      tally,
      { source: deps.sources.breakdowns.id, operation: 'breakdown', query: holders },
      () => deps.sources.breakdowns.breakdown(holders),
    );

    const unique = uniqueSubcontracts(rows);
    const ranking = rankPrimes(
      unique,
      held.kind === 'ok' ? obligationsByUei(held.value.rows) : new Map(),
      { primes: PRIMES_LISTED, subcontractors: SUBCONTRACTORS_LISTED },
    );
    return {
      kind: 'ok',
      body: {
        scope,
        from: query.from,
        to: query.to,
        band: query.band,
        total: total.value,
        read: rows.length,
        duplicates: rows.length - unique.length,
        capped: more || cutShort,
        ...ranking,
      },
      asOf: await asOfFrom(deps),
      requests: tally.requests,
      keep: !cutShort && held.kind === 'ok',
    };
  },
});
