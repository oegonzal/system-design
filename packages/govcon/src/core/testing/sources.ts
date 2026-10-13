/** The notice search, the descriptions and the request ledger, scripted and in memory. */
import { type OperationQuery, type SourceOperation } from '@sysdesign/contracts';

import type {
  FreshCall,
  LedgerEntry,
  NoticeDescriptions,
  OpportunitySearch,
  SearchPage,
  SourceCallLog,
  SourceCallRecord,
} from '../ports';
import type { OpportunityQuery } from '../query';
import { type Scripted, asAttempted, okText } from './replies';

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

  async list(
    limit: number,
    offset: number,
    operation: SourceOperation | null = null,
  ): Promise<[SourceCallRecord[], number]> {
    this.fail();
    const matching = [...this.calls]
      .filter((call) => operation === null || call.operation === operation)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    return [matching.slice(offset, offset + limit), matching.length];
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
