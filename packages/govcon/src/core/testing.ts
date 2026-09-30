/**
 * Pure fakes for the core and the service. No vitest imports, so this
 * compiles under the app tsconfig and a spec anywhere can lean on it.
 */
import {
  awardOf,
  MAX_AWARD_LIMIT,
  profileOf,
  type Award,
  type AwardsRequest,
  type Opportunity,
  type OperationQuery,
  type SearchProfile,
  type SourceOperation,
  type SpendingRequest,
} from '@sysdesign/contracts';

import type { Attempted, AttemptRecord, Fetched, SourceFailure } from './budget';
import type { SourceAvailability } from '@sysdesign/contracts';
import type {
  AwardDraft,
  AwardFilter,
  AwardPage,
  AwardRepository,
  BidInput,
  BidRecord,
  BidRepository,
  BidWithNotice,
  CandidateFilter,
  CandidateSet,
  ContractAwards,
  FreshCall,
  HistoryRow,
  LedgerEntry,
  NoticeDescriptions,
  OpportunityRepository,
  OpportunitySearch,
  PipelineFilter,
  ProfileRecord,
  ProfileRepository,
  RejectedRecord,
  SavedSearchInput,
  SavedSearchRecord,
  SavedSearchRepository,
  SearchPage,
  SourceCallLog,
  SourceCallRecord,
  SpendingAwards,
  StoredDescription,
  UpsertSummary,
} from './ports';
import { NO_HISTORY, type ScoringContext } from './scoring';
import type { OpportunityQuery } from './query';

export { opportunityOf } from '@sysdesign/contracts';

/** A small profile every factor can price; the factor ids must match `FACTORS`. */
export const tinyProfile = (overrides: Partial<SearchProfile> = {}): SearchProfile =>
  profileOf(overrides);

/** The item at `index`, or a failure a spec can read — never a non-null assertion. */
export function pick<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index} of ${items.length}`);
  return item;
}

/** A value a fake or a repository answered, or a failure a spec can read. */
export function must<T>(value: T | null | undefined | 'conflict'): T {
  if (value === null || value === undefined || value === 'conflict')
    throw new Error(`expected a value, got ${String(value)}`);
  return value;
}

/** The fixed instant the fakes stamp attempts with. */
export const T0 = new Date('2026-09-26T12:00:00.000Z');

/** A scoring context at `T0` with no stored awards. */
export const contextAt = (nowMs = T0.getTime()): ScoringContext => ({ nowMs, history: NO_HISTORY });

/** The two saved searches the tiny profile pulls, one per NAICS. */
export const tinySearches = (profileId = 'tiny'): SavedSearchRecord[] =>
  [
    { name: 'Machine shops', filter: { naics: '332710' }, pullOrder: 0 },
    { name: 'Computer services', filter: { naics: '5415' }, pullOrder: 1 },
  ].map((search, index) => ({
    id: `s-${index + 1}`,
    profileId,
    days: 3,
    includedInPull: true,
    lastRunAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...search,
  }));

export const okPage = (
  opportunities: Opportunity[],
  totalRecords = opportunities.length,
  rejected: RejectedRecord[] = [],
): Fetched<SearchPage> => ({
  kind: 'ok',
  value: { opportunities, rejected, totalRecords },
  recordCount: opportunities.length + rejected.length,
  totalRecords,
});

export const okText = (text: string): Fetched<string> => ({
  kind: 'ok',
  value: text,
  recordCount: 1,
  totalRecords: null,
});

export const failure = (
  outcome: SourceFailure['outcome'],
  status: number | null,
  message: string,
): SourceFailure => ({ kind: 'error', outcome, status, message });

/** The one attempt a fake makes for a result: 200 when ok, the failure's status otherwise. */
export const attemptOf = (result: Fetched<unknown>, startedAt = T0): AttemptRecord =>
  result.kind === 'ok'
    ? { startedAt, durationMs: 10, status: 200, outcome: 'ok', error: null }
    : {
        startedAt,
        durationMs: 10,
        status: result.status,
        outcome: result.outcome,
        error: result.message,
      };

export const attempted = <T>(
  result: Fetched<T>,
  attempts?: AttemptRecord[],
): Attempted<Fetched<T>> => ({
  attempts: attempts ?? [attemptOf(result)],
  result,
});

/** A reply a scripted adapter gives: a bare result (one attempt) or the attempts spelled out. */
export type Scripted<T> = Fetched<T> | Attempted<Fetched<T>>;

const asAttempted = <T>(reply: Scripted<T>): Attempted<Fetched<T>> =>
  'attempts' in reply ? reply : attempted(reply);

/**
 * Answers the scripted replies in order, repeating the last, and remembers
 * every query. `script` restarts it with new replies — a suite whose app is
 * booted once can seed each test on its own.
 */
export function scriptedSearch(
  id: string,
  initial: readonly Scripted<SearchPage>[],
  enabled = true,
): OpportunitySearch & {
  queries: OpportunityQuery[];
  script(replies: readonly Scripted<SearchPage>[]): void;
} {
  const queries: OpportunityQuery[] = [];
  let replies = initial;
  let call = 0;
  return {
    id,
    availability: { enabled, reason: enabled ? null : 'no-key' },
    queries,
    script(next) {
      replies = next;
      call = 0;
      queries.length = 0;
    },
    async search(query) {
      queries.push(query);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new Error('scriptedSearch: no replies');
      return asAttempted(reply);
    },
  };
}

/** Answers the scripted replies in order; without any, a text built from the notice id. */
export function scriptedDescriptions(
  id: string,
  replies: readonly Scripted<string>[] = [],
  enabled = true,
): NoticeDescriptions & { fetched: string[] } {
  const fetched: string[] = [];
  let call = 0;
  return {
    id,
    availability: { enabled, reason: enabled ? null : 'no-key' },
    fetched,
    async get(noticeId) {
      fetched.push(noticeId);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      return asAttempted(reply ?? okText(`Description of ${noticeId}`));
    },
  };
}

export class InMemorySourceCallLog implements SourceCallLog {
  readonly calls: SourceCallRecord[] = [];
  /** When set, every method throws — the "log unavailable" branch. */
  failing: Error | null = null;

  async record<K extends SourceOperation>(entry: LedgerEntry<K>): Promise<void> {
    this.fail();
    // The fake is the read boundary here, as the database row is in the adapter.
    const row = { id: `call-${this.calls.length + 1}`, ...entry } as unknown as SourceCallRecord;
    this.calls.push(row);
  }

  async list(limit: number, offset: number): Promise<[SourceCallRecord[], number]> {
    this.fail();
    const newestFirst = [...this.calls].sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime(),
    );
    return [newestFirst.slice(offset, offset + limit), this.calls.length];
  }

  async findFresh(
    source: string,
    operation: SourceOperation,
    queryKey: string,
    notBefore: Date,
  ): Promise<FreshCall | null> {
    this.fail();
    const fresh = this.calls
      .filter(
        (call) =>
          call.source === source &&
          call.operation === operation &&
          call.queryKey === queryKey &&
          call.outcome === 'ok' &&
          call.requestedAt.getTime() >= notBefore.getTime(),
      )
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    return fresh ? { requestedAt: fresh.requestedAt, recordCount: fresh.recordCount } : null;
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

/** The operation and query of a recorded row, for an assertion. */
export const operationOf = (call: SourceCallRecord): OperationQuery =>
  ({ operation: call.operation, query: call.query }) as OperationQuery;

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
      .filter((o) => filter.setAsideCode === null || o.setAsideCode === filter.setAsideCode)
      .filter((o) => filter.noticeType === null || o.noticeType === filter.noticeType)
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

export class InMemoryProfileRepository implements ProfileRepository {
  readonly rows = new Map<string, ProfileRecord>();

  async list(): Promise<ProfileRecord[]> {
    return [...this.rows.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id));
  }

  async find(id: string): Promise<ProfileRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findDefault(): Promise<ProfileRecord | null> {
    return [...this.rows.values()].find((row) => row.isDefault) ?? null;
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async insert(
    profile: SearchProfile,
    isDefault: boolean,
    at: Date,
  ): Promise<ProfileRecord | null> {
    if (this.rows.has(profile.id)) return null;
    const row = { profile, isDefault, createdAt: at, updatedAt: at };
    this.rows.set(profile.id, row);
    return row;
  }

  async update(profile: SearchProfile, at: Date): Promise<ProfileRecord | null> {
    const existing = this.rows.get(profile.id);
    if (!existing) return null;
    const row = { ...existing, profile, updatedAt: at };
    this.rows.set(profile.id, row);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async setDefault(id: string): Promise<boolean> {
    if (!this.rows.has(id)) return false;
    for (const [key, row] of this.rows) this.rows.set(key, { ...row, isDefault: key === id });
    return true;
  }
}

export class InMemorySavedSearchRepository implements SavedSearchRepository {
  readonly rows = new Map<string, SavedSearchRecord>();
  private next = 1;

  async listByProfile(profileId: string): Promise<SavedSearchRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.profileId === profileId)
      .sort((a, b) => a.pullOrder - b.pullOrder || a.name.localeCompare(b.name));
  }

  async find(id: string): Promise<SavedSearchRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(
    profileId: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null> {
    if (this.taken(profileId, input.name, null)) return null;
    const row = {
      id: `s-${this.next++}`,
      profileId,
      lastRunAt: null,
      createdAt: at,
      updatedAt: at,
      ...input,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    id: string,
    input: SavedSearchInput,
    at: Date,
  ): Promise<SavedSearchRecord | null | 'conflict'> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (this.taken(existing.profileId, input.name, id)) return 'conflict';
    const row = { ...existing, ...input, updatedAt: at };
    this.rows.set(id, row);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async markRun(ids: readonly string[], at: Date): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) this.rows.set(id, { ...row, lastRunAt: at });
    }
  }

  private taken(profileId: string, name: string, except: string | null): boolean {
    return [...this.rows.values()].some(
      (row) => row.profileId === profileId && row.name === name && row.id !== except,
    );
  }
}

/** Bids over an opportunity repository's rows, so a listing joins the notice the way the store does. */
export class InMemoryBidRepository implements BidRepository {
  readonly rows = new Map<string, BidRecord>();

  constructor(private readonly notices: InMemoryOpportunityRepository) {}

  async find(noticeId: string): Promise<BidRecord | null> {
    return this.rows.get(noticeId) ?? null;
  }

  async save(noticeId: string, input: BidInput, at: Date): Promise<BidRecord> {
    const existing = this.rows.get(noticeId);
    const row: BidRecord = {
      noticeId,
      ...input,
      stageChangedAt: existing && existing.stage === input.stage ? existing.stageChangedAt : at,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.rows.set(noticeId, row);
    return row;
  }

  async remove(noticeId: string): Promise<boolean> {
    return this.rows.delete(noticeId);
  }

  async list(filter: PipelineFilter): Promise<[BidWithNotice[], number]> {
    const all = (await this.listAll()).filter(
      (row) => filter.stage === null || row.bid.stage === filter.stage,
    );
    return [all.slice(filter.offset, filter.offset + filter.limit), all.length];
  }

  async listAll(): Promise<BidWithNotice[]> {
    return [...this.rows.values()]
      .flatMap((bid) => {
        const row = this.notices.rows.get(bid.noticeId);
        return row ? [{ bid, opportunity: row.opportunity }] : [];
      })
      .sort(
        (a, b) =>
          b.bid.updatedAt.getTime() - a.bid.updatedAt.getTime() ||
          a.bid.noticeId.localeCompare(b.bid.noticeId),
      );
  }
}

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
