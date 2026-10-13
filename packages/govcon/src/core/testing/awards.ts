/**
 * Awards as an adapter answers them, both award sources scripted, and the
 * award store in memory.
 */
import {
  awardOf,
  MAX_AWARD_LIMIT,
  type Award,
  type AwardsRequest,
  type SourceAvailability,
  type SpendingRequest,
} from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';
import type {
  AwardDraft,
  AwardFilter,
  AwardPage,
  AwardRepository,
  ContractAwards,
  HistoryRow,
  SpendingAwards,
  UpsertSummary,
} from '../ports';
import { type Scripted, asAttempted } from './replies';

/** An award as an adapter answers it — the wire record minus the fetch stamp the service adds. */
export const awardDraftOf = (overrides: Partial<Award> = {}): AwardDraft =>
  Object.fromEntries(
    Object.entries(awardOf(overrides)).filter(([key]) => key !== 'fetchedAt'),
  ) as AwardDraft;

export const awardPageOf = (
  awards: AwardPage['awards'],
  overrides: Partial<Omit<AwardPage, 'awards'>> = {},
): Fetched<AwardPage> => ({
  kind: 'ok',
  value: { awards, rejected: 0, totalRecords: awards.length, hasMore: false, ...overrides },
  recordCount: awards.length + (overrides.rejected ?? 0),
  totalRecords: overrides.totalRecords ?? awards.length,
});

/** Answers the scripted pages in order, repeating the last, for either award source. */
export function scriptedAwards<R extends AwardsRequest | SpendingRequest>(
  id: string,
  replies: readonly Scripted<AwardPage>[],
  enabled = true,
): {
  id: string;
  availability: SourceAvailability;
  requests: R[];
  search(request: R): Promise<Attempted<Fetched<AwardPage>>>;
} {
  const requests: R[] = [];
  let call = 0;
  return {
    id,
    availability: { enabled, reason: enabled ? null : 'no-key' },
    requests,
    async search(request) {
      requests.push(request);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new Error('scriptedAwards: no replies');
      return asAttempted(reply);
    },
  };
}

export const scriptedContractAwards = (replies: readonly Scripted<AwardPage>[], enabled = true) =>
  scriptedAwards<AwardsRequest>('sam.gov', replies, enabled) satisfies ContractAwards;
export const scriptedSpendingAwards = (replies: readonly Scripted<AwardPage>[]) =>
  scriptedAwards<SpendingRequest>('usaspending', replies) satisfies SpendingAwards;

const matchesAward = (award: Award, filter: AwardFilter): boolean =>
  (filter.naicsPrefix === null || (award.naicsCode ?? '').startsWith(filter.naicsPrefix)) &&
  (filter.pscPrefix === null || (award.pscCode ?? '').startsWith(filter.pscPrefix)) &&
  (filter.agencyContains === null ||
    (award.agencyPath ?? '').toLowerCase().includes(filter.agencyContains.toLowerCase())) &&
  (filter.solicitationNumber === null || award.solicitationNumber === filter.solicitationNumber) &&
  (filter.awardeeUei === null || award.awardeeUei === filter.awardeeUei) &&
  (filter.signedFrom === null || award.signedAt >= filter.signedFrom) &&
  (filter.signedTo === null || award.signedAt <= filter.signedTo) &&
  (filter.source === null || award.source === filter.source);

const byNewest = (a: Award, b: Award): number =>
  b.signedAt.localeCompare(a.signedAt) || a.externalId.localeCompare(b.externalId);

export class InMemoryAwardRepository implements AwardRepository {
  readonly rows = new Map<string, Award>();

  async upsertMany(awards: readonly Award[]): Promise<UpsertSummary> {
    let inserted = 0;
    let updated = 0;
    for (const award of awards) {
      const key = `${award.source}:${award.externalId}`;
      if (this.rows.has(key)) updated += 1;
      else inserted += 1;
      this.rows.set(key, award);
    }
    return { inserted, updated };
  }

  async list(filter: AwardFilter, limit: number, offset: number): Promise<[Award[], number]> {
    const all = [...this.rows.values()]
      .filter((award) => matchesAward(award, filter))
      .sort(byNewest);
    return [all.slice(offset, offset + limit), all.length];
  }

  async findMatching(filter: AwardFilter, limit = MAX_AWARD_LIMIT): Promise<Award[]> {
    return (await this.list(filter, limit, 0))[0];
  }

  async history(since: string): Promise<HistoryRow[]> {
    return [...this.rows.values()]
      .filter((award) => award.signedAt >= since)
      .map(({ naicsCode, agencyCode, signedAt }) => ({ naicsCode, agencyCode, signedAt }));
  }
}
