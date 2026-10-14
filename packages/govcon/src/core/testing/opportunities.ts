/** The notice store in memory. */
import { type Opportunity } from '@sysdesign/contracts';

import type {
  CandidateFilter,
  CandidateSet,
  OpportunityRepository,
  StoredDescription,
  UpsertSummary,
} from '../ports';

export class InMemoryOpportunityRepository implements OpportunityRepository {
  readonly rows = new Map<
    string,
    { opportunity: Opportunity; firstSeenAt: Date; lastSeenAt: Date }
  >();
  readonly descriptions = new Map<string, StoredDescription>();

  async upsertMany(items: readonly Opportunity[], seenAt: Date): Promise<UpsertSummary> {
    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const existing = this.rows.get(item.noticeId);
      if (existing) {
        this.rows.set(item.noticeId, { ...existing, opportunity: item, lastSeenAt: seenAt });
        updated += 1;
      } else {
        this.rows.set(item.noticeId, {
          opportunity: item,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
        });
        inserted += 1;
      }
    }
    return { inserted, updated };
  }

  async findCandidates(filter: CandidateFilter): Promise<CandidateSet> {
    const has = (haystack: string | null, needle: string) =>
      haystack !== null && haystack.toLowerCase().includes(needle.toLowerCase());
    const matching = [...this.rows.values()]
      .map((row) => row.opportunity)
      .filter((o) => !filter.activeOnly || o.active !== false)
      .filter(
        (o) =>
          filter.postedOnOrAfter === null ||
          Date.parse(o.postedAt) >= filter.postedOnOrAfter.getTime(),
      )
      .filter(
        (o) =>
          filter.deadlineOnOrAfter === null ||
          o.responseDeadlineAt === null ||
          Date.parse(o.responseDeadlineAt) >= filter.deadlineOnOrAfter.getTime(),
      )
      .filter(
        (o) =>
          filter.deadlineOnOrBefore === null ||
          (o.responseDeadlineAt !== null &&
            Date.parse(o.responseDeadlineAt) <= filter.deadlineOnOrBefore.getTime()),
      )
      .filter(
        (o) =>
          filter.setAsideCodes === null ||
          o.setAsideCode === null ||
          filter.setAsideCodes.includes(o.setAsideCode),
      )
      .filter((o) => o.noticeType === null || !filter.excludeNoticeTypes.includes(o.noticeType))
      .filter(
        (o) => filter.naicsPrefix === null || (o.naicsCode ?? '').startsWith(filter.naicsPrefix),
      )
      .filter(
        (o) =>
          filter.naicsCodes === null ||
          (o.naicsCode !== null && filter.naicsCodes.includes(o.naicsCode)),
      )
      .filter((o) => filter.setAsideCode === null || o.setAsideCode === filter.setAsideCode)
      .filter(
        (o) =>
          filter.noticeTypes === null ||
          (o.noticeType !== null && filter.noticeTypes.includes(o.noticeType)),
      )
      .filter((o) => filter.agencyContains === null || has(o.agencyPath, filter.agencyContains))
      .filter(
        (o) =>
          filter.textContains === null ||
          has(o.title, filter.textContains) ||
          has(o.solicitationNumber, filter.textContains),
      )
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.noticeId.localeCompare(b.noticeId));
    return {
      opportunities: matching.slice(0, filter.limit),
      capped: matching.length > filter.limit,
    };
  }

  async findOne(noticeId: string): Promise<Opportunity | null> {
    return this.rows.get(noticeId)?.opportunity ?? null;
  }

  async findDescription(noticeId: string): Promise<StoredDescription | null> {
    return this.descriptions.get(noticeId) ?? null;
  }

  async saveDescription(noticeId: string, description: StoredDescription): Promise<void> {
    this.descriptions.set(noticeId, description);
  }
}
