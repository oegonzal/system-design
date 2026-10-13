import type { SpendingLens } from '@sysdesign/contracts';

/** One lens answer as stored: the body, when it was taken and what it cost. */
export interface SnapshotRow {
  lens: SpendingLens;
  queryKey: string;
  query: object;
  fetchedAt: Date;
  asOf: string | null;
  requests: number;
  payload: unknown;
}

export interface SpendingSnapshotStore {
  find(lens: SpendingLens, queryKey: string): Promise<SnapshotRow | null>;
  /** Insert or replace by `(lens, queryKey)`. */
  put(row: SnapshotRow): Promise<void>;
}
