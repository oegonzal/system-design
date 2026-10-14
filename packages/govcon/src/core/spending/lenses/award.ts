import {
  SUBCONTRACTORS_LISTED,
  type AwardBody,
  type AwardDetailRequest,
  type AwardSubawardsRequest,
} from '@sysdesign/contracts';

import type { LensSpec } from '../lens';
import { awardBodySchema } from '../schemas';
import { missing, spend, type LensDeps } from './deps';
import { asOfFrom } from './shared';

/** One award, by the source's own id. */
export interface AwardQuery {
  externalId: string;
}

/**
 * One award's own record: who holds it and for whom, the vehicle it was
 * placed under, what is obligated against what it can reach, when it ends
 * and when it would end with every option, how it was competed, what was
 * ordered under it when it is itself a vehicle, and the largest
 * subcontracts reported under it. The record is one read; a vehicle's
 * orders are a second, and a roster is one more only when the record
 * counts a subcontract. An id the source does not have is `missing`.
 */
export const awardLens = (deps: LensDeps): LensSpec<AwardQuery, AwardBody> => ({
  lens: 'award',
  source: deps.sources.awards.id,
  schema: awardBodySchema,
  disclosures: deps.sources.awards.disclosures,
  async load({ externalId }) {
    const tally = { requests: 0 };
    const awards = deps.sources.awards;
    const request: AwardDetailRequest = { externalId };
    const record = await spend(
      deps,
      tally,
      { source: awards.id, operation: 'award-detail', query: request },
      () => awards.detail(request),
    );
    if (record.kind !== 'ok') return record;
    if (record.value === null) return missing('award', externalId);

    let orders: AwardBody['orders'] = null;
    if (record.value.family === 'idvs') {
      const placed = await spend(
        deps,
        tally,
        { source: awards.id, operation: 'award-orders', query: request },
        () => awards.orders(request),
      );
      if (placed.kind !== 'ok') return placed;
      orders = placed.value;
    }
    let subcontracts: AwardBody['subcontracts'] = [];
    if (record.value.subcontractCount > 0) {
      const roster: AwardSubawardsRequest = { externalId, limit: SUBCONTRACTORS_LISTED };
      const listed = await spend(
        deps,
        tally,
        { source: awards.id, operation: 'award-subawards', query: roster },
        () => awards.subcontracts(roster),
      );
      if (listed.kind !== 'ok') return listed;
      subcontracts = listed.value;
    }
    return {
      kind: 'ok',
      body: { ...record.value, orders, subcontracts },
      asOf: await asOfFrom(deps),
      requests: tally.requests,
    };
  },
});
