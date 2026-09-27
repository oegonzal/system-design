/**
 * Pure fakes and fixtures for the core and the service. No vitest imports, so
 * this compiles under the app tsconfig and a spec anywhere can lean on it.
 */
import type { Opportunity } from '@sysdesign/contracts';

import type {
  CandidateFilter,
  DescribeResult,
  FetchedOpportunity,
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

export const opportunityOf = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  noticeId: 'n-1',
  title: 'Additive manufacturing of replacement brackets',
  solicitationNumber: 'SPE4A7-26-Q-0001',
  agencyPath: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA AVIATION',
  agencyCode: '097.97AS.SPE4A7',
  postedAt: '2026-09-20T00:00:00.000Z',
  responseDeadlineAt: '2026-10-10T12:00:00.000Z',
  archiveAt: null,
  archiveType: 'auto15',
  noticeType: 'Solicitation',
  baseType: 'Solicitation',
  active: true,
  naicsCode: '332710',
  naicsCodes: ['332710'],
  classificationCode: '5340',
  setAsideCode: 'SBA',
  setAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
  organizationType: 'OFFICE',
  placeOfPerformance: { city: 'Richmond', state: 'VA', zip: '23297', country: 'USA' },
  officeAddress: { city: 'RICHMOND', state: 'VA', zip: '23297', countryCode: 'USA' },
  pointsOfContact: [
    { type: 'primary', title: null, fullName: 'A. Buyer', email: 'a.buyer@dla.mil', phone: null },
  ],
  descriptionUrl: 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=n-1',
  uiLink: 'https://sam.gov/opp/n-1/view',
  additionalInfoLink: null,
  resourceLinks: [],
  award: null,
  source: 'sam.gov',
  ...overrides,
});

/** A small profile every factor can price; the factor ids must match `FACTORS`. */
export const tinyProfile = (overrides: Partial<SearchProfile> = {}): SearchProfile => ({
  id: 'tiny',
  company: 'Tiny LLC',
  naics: ['332710', '5415'],
  psc: ['53', 'D3'],
  interests: [
    { term: 'additive manufacturing', aliases: ['3d printing'], weight: 0.6 },
    { term: 'replacement parts', aliases: ['replacement brackets'], weight: 0.5 },
  ],
  pull: { slices: [{ naics: '332710' }, { naics: '5415' }], pageSize: 100, maxPagesPerSlice: 1 },
  scoring: {
    weights: {
      naics: 0.3,
      psc: 0.15,
      interests: 0.15,
      setAside: 0.15,
      noticeType: 0.1,
      deadline: 0.15,
    },
    setAside: { byCode: { SBA: 1, SBP: 0.8 }, unrestricted: 0.5 },
    noticeType: {
      byType: { Solicitation: 1, 'Sources Sought': 0.7 },
      default: 0.2,
      exclude: ['Award Notice'],
    },
    deadline: {
      bands: [
        { maxDays: 3, value: 0.3 },
        { maxDays: 14, value: 1 },
        { maxDays: 45, value: 0.8 },
      ],
      beyond: 0.6,
      none: 0.4,
    },
    tiers: { high: 70, medium: 45 },
  },
  ...overrides,
});

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
      return (
        reply ?? {
          kind: 'ok',
          text: `Description of ${noticeId}`,
          raw: { description: `<p>Description of ${noticeId}</p>` },
        }
      );
    },
  };
}

export const fetched = (overrides: Partial<Opportunity> = {}): FetchedOpportunity => {
  const opportunity = opportunityOf(overrides);
  return { opportunity, raw: { noticeId: opportunity.noticeId, title: opportunity.title } };
};

export const okResult = (
  opportunities: FetchedOpportunity[],
  totalRecords = opportunities.length,
  rejected: RejectedRecord[] = [],
): SourceResult => ({ kind: 'ok', opportunities, rejected, totalRecords });

export class InMemoryOpportunityRepository implements OpportunityRepository {
  readonly rows = new Map<
    string,
    { opportunity: Opportunity; firstSeenAt: Date; lastSeenAt: Date }
  >();
  readonly descriptions = new Map<string, StoredDescription>();

  async upsertMany(items: readonly FetchedOpportunity[], seenAt: Date): Promise<UpsertSummary> {
    let inserted = 0;
    let updated = 0;
    for (const { opportunity: item } of items) {
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
