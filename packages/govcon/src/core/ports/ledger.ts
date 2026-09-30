import type {
  OperationQuery,
  SourceCallOutcome,
  SourceCallQueries,
  SourceOperation,
} from '@sysdesign/contracts';

/** What every ledger row records about one HTTP attempt, whatever its operation. */
export interface LedgerColumns {
  source: string;
  /** 1 for the first attempt of a call, 2 for its retry — same key, own row. */
  attempt: number;
  queryKey: string;
  requestedAt: Date;
  durationMs: number;
  status: number | null;
  outcome: SourceCallOutcome;
  totalRecords: number | null;
  recordCount: number | null;
  error: string | null;
}

/** An attempt as the gate writes it: the operation types the query. */
export type LedgerEntry<K extends SourceOperation = SourceOperation> = LedgerColumns & {
  operation: K;
  query: SourceCallQueries[K];
};

/** A row as read back: the id it was given, and `operation` discriminating `query`. */
export type SourceCallRecord = LedgerColumns & OperationQuery & { id: string };

/** A successful call inside the cache window. */
export interface FreshCall {
  requestedAt: Date;
  recordCount: number | null;
}

export interface SourceCallLog {
  record<K extends SourceOperation>(entry: LedgerEntry<K>): Promise<void>;
  /** The latest `ok` row of that operation for the key made at or after `notBefore`, if any. */
  findFresh(
    source: string,
    operation: SourceOperation,
    queryKey: string,
    notBefore: Date,
  ): Promise<FreshCall | null>;
  /** Every attempt since `since`, whatever its outcome or operation. */
  countSince(source: string, since: Date): Promise<number>;
  /** Newest first, with the total. */
  list(limit: number, offset: number): Promise<[SourceCallRecord[], number]>;
}
