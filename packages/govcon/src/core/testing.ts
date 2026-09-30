/**
 * Pure fakes and fixtures for the core and the service. No vitest imports, so
 * this compiles under the app tsconfig and a spec anywhere can lean on it.
 */
import { profileOf, opportunityOf, type Opportunity } from '@sysdesign/contracts';

import type {
  CandidateFilter,
  DescribeResult,
  FreshCall,
  OpportunityRepository,
  OpportunitySource,
  RejectedRecord,
  SourceCall,
  SourceCallLog,
  SourceCallRecord,
  SourceResult,
  StoredDescription,
  UpsertSummary,
} from './ports';
import type { SearchProfile } from './profile';
import type { OpportunityQuery } from './query';

export { opportunityOf } from '@sysdesign/contracts';

/** A small profile every factor can price; the factor ids must match `FACTORS`. */
export const tinyProfile = (overrides: Partial<SearchProfile> = {}): SearchProfile =>
  profileOf(overrides);

export class InMemorySourceCallLog implements SourceCallLog {
  readonly calls: SourceCallRecord[] = [];
  /** When set, every method throws — the "log unavailable" branch. */
  failing: Error | null = null;

  async record(call: SourceCall): Promise<void> {
    this.fail();
    this.calls.push({ id: `call-${this.calls.length + 1}`, ...call });
  }

  async list(limit: number, offset: number): Promise<[SourceCallRecord[], number]> {
    this.fail();
    const newestFirst = [...this.calls].sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime(),
    );
    return [newestFirst.slice(offset, offset + limit), this.calls.length];
  }

  async findFresh(source: string, queryKey: string, notBefore: Date): Promise<FreshCall | null> {
    this.fail();
    const fresh = this.calls
      .filter(
        (call) =>
          call.source === source &&
          call.operation === 'search' &&
          call.queryKey === queryKey &&
          call.outcome === 'ok' &&
          call.requestedAt.getTime() >= notBefore.getTime(),
      )
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    return fresh
      ? {
          requestedAt: fresh.requestedAt,
          totalRecords: fresh.totalRecords,
          recordCount: fresh.recordCount,
        }
      : null;
  }

  async countSince(source: string, since: Date): Promise<number> {
    this.fail();
    return this.calls.filter(
      (call) => call.source === source && call.requestedAt.getTime() >= since.getTime(),
    ).length;
  }

  private fail(): void {
    if (this.failing) throw this.failing;
  }
}

/**
 * A source that answers the scripted results in order, repeating the last, and
 * remembers what it was asked — searches in `queries`, descriptions in
 * `described`. Without scripted descriptions, `describe` answers a text built
 * from the notice id.
 */
export function scriptedSource(
  id: string,
  replies: readonly SourceResult[],
  enabled = true,
  descriptions: readonly DescribeResult[] = [],
): OpportunitySource & { queries: OpportunityQuery[]; described: string[] } {
  const queries: OpportunityQuery[] = [];
  const described: string[] = [];
  let call = 0;
  let describeCall = 0;
  return {
    id,
    availability: { enabled, reason: enabled ? null : 'no-key' },
    queries,
    described,
    async search(query) {
      queries.push(query);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new Error('scriptedSource: no replies');
      return reply;
    },
    async describe(noticeId) {
      described.push(noticeId);
      const reply = descriptions[Math.min(describeCall, descriptions.length - 1)];
      describeCall += 1;
      return reply ?? { kind: 'ok', text: `Description of ${noticeId}` };
    },
  };
}

export const okResult = (
  opportunities: Opportunity[],
  totalRecords = opportunities.length,
  rejected: RejectedRecord[] = [],
): SourceResult => ({ kind: 'ok', opportunities, rejected, totalRecords });

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

  async findCandidates(filter: CandidateFilter): Promise<Opportunity[]> {
    return [...this.rows.values()]
      .map((row) => row.opportunity)
      .filter((opportunity) => !filter.activeOnly || opportunity.active !== false)
      .filter(
        (opportunity) =>
          filter.deadlineOnOrAfter === null ||
          opportunity.responseDeadlineAt === null ||
          Date.parse(opportunity.responseDeadlineAt) >= filter.deadlineOnOrAfter.getTime(),
      );
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
