/**
 * The runtime's ports. Postgres keeps the truth (`RecordStore`) and a vector
 * index its rebuildable projection (`VectorIndex`); the host hands in the
 * embedder, the clock and the ids — the runtime constructs no model client,
 * reads no environment and keeps no time of its own. The engine depends on
 * these alone. The Postgres and pgvector adapters implement them, and so do
 * the fakes in `testing/`, which hold the same contract.
 */
import type { RecordScope, RecordStatus, RegisterKind } from '@sysdesign/contracts';

export type Clock = () => Date;
/** Record, space and lineage ids are uuids: the Postgres store refuses anything else. */
export type Ids = () => string;

/** Texts to vectors; a null `model` is a disabled embedder. `@sysdesign/llm`'s client fits as it is. */
export interface Embedder {
  readonly model: string | null;
  readonly dimensions: number;
  embed(inputs: readonly string[]): Promise<number[][] | null>;
}

export interface Provenance {
  source: string;
  sourceRunId: string | null;
  /** The records this one was derived from: the episodes a lesson cites, the lessons a playbook holds. */
  derivedFrom: readonly string[];
}

/** A derived record's evidence: what consolidation refreshes without touching its content. */
export interface Evidence {
  support: number;
  derivedFrom: readonly string[];
}

export interface MemoryRecord {
  id: string;
  spaceId: string;
  register: string;
  kind: RegisterKind;
  partition: string;
  scope: RecordScope;
  identity: string | null;
  keys: readonly string[];
  body: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, string>>;
  text: string;
  contentHash: string;
  status: RecordStatus;
  version: number;
  supersedesId: string | null;
  lineageId: string;
  validFrom: Date;
  validTo: Date | null;
  recordedAt: Date;
  expiresAt: Date | null;
  closedAt: Date | null;
  closeReason: string | null;
  support: number;
  provenance: Provenance;
  projectedInto: string | null;
}

/** How a current record closes. */
export interface Closing {
  status: Exclude<RecordStatus, 'active'>;
  validTo: Date;
  closedAt: Date;
  reason: string | null;
}

/** One write: the next record, and the current one it supersedes, closed in the same transaction. */
export interface RecordChange {
  insert: MemoryRecord;
  close: { id: string; closing: Closing } | null;
}

/** How a write finds the current record it reconciles with: by identity, or by content for a kind that appends. */
export type ResolveKey = { spaceId: string; register: string; scope: RecordScope } & (
  { identity: string } | { contentHash: string }
);

/**
 * A read of current, unexpired records. `visible` returns the records whose
 * scope the request's contains (a recall); `within` returns those whose scope
 * contains the request's — everything at or below it, as a consolidation over
 * a tenant reads every user's episodes in it.
 */
export interface RecordQuery {
  spaceId: string;
  registers: readonly string[];
  partition: string;
  scope: RecordScope;
  scopeMode: 'visible' | 'within';
  now: Date;
  ids?: readonly string[];
  key?: string;
  since?: Date;
  until?: Date;
  where?: Readonly<Record<string, string>>;
  limit: number | null;
}

export interface RecordStore {
  /** One transaction: the compare-and-set close (when there is one), then the insert. A lost race or a unique violation is `conflict`. */
  commit(change: RecordChange): Promise<'committed' | 'conflict'>;
  /** Close a current record; `conflict` when it is no longer current. */
  close(id: string, closing: Closing): Promise<'closed' | 'conflict'>;
  /** A derived record's evidence, refreshed in place; its content never changes. */
  reinforce(id: string, evidence: Evidence): Promise<void>;
  get(spaceId: string, id: string): Promise<MemoryRecord | null>;
  current(key: ResolveKey): Promise<MemoryRecord | null>;
  /** Newest valid time first, then by id. */
  find(query: RecordQuery): Promise<MemoryRecord[]>;
  /** Every version of one identity, oldest first. */
  lineage(spaceId: string, lineageId: string): Promise<MemoryRecord[]>;
  /** Close every current record past its expiry, in every space, and answer the rows it closed. */
  expire(now: Date): Promise<MemoryRecord[]>;
  /** At most `limit` current records of these kinds whose point is not in this collection, in id order. */
  projectionDue(
    collection: string,
    kinds: readonly RegisterKind[],
    limit: number,
  ): Promise<MemoryRecord[]>;
  /**
   * At most `limit` closed records still marked as projected — into any
   * collection — in id order. A closed record carries no mark: the sweep
   * removes its point when the mark names the current collection and forgets
   * the mark when it names one that is no longer current.
   */
  unprojectionDue(limit: number): Promise<MemoryRecord[]>;
  /** Where these records' points now live. Never guarded by status, so a record closed mid-projection is still found. */
  markProjected(ids: readonly string[], collection: string | null): Promise<void>;
}

export interface StoredSpace {
  id: string;
  /** The name it was ensured under; null for a space made without one. */
  name: string | null;
  designRunId: string;
  strategy: unknown;
  policy: unknown;
  policySource: string;
  createdAt: Date;
}

export interface SpaceStore {
  /** Keep a space; `name_taken` when another space holds its name, and then nothing is kept. */
  insert(space: StoredSpace): Promise<'inserted' | 'name_taken'>;
  get(id: string): Promise<StoredSpace | null>;
  findByName(name: string): Promise<StoredSpace | null>;
}

/** What a point carries to be filtered on — never the text, which Postgres keeps. */
export interface PointPayload {
  spaceId: string;
  register: string;
  partition: string;
  scope: RecordScope;
  metadata: Readonly<Record<string, string>>;
  validFrom: string;
  expiresAt: string | null;
}

/** The visibility a search applies, its scope rule read over the policy's scope keys rather than the request's. */
export interface VisibilityFilter {
  spaceId: string;
  registers: readonly string[];
  partition: string;
  scope: RecordScope;
  scopeKeys: readonly string[];
  now: Date;
  since?: Date;
  until?: Date;
  where?: Readonly<Record<string, string>>;
}

export interface VectorIndex {
  /** The collection points live in, bound to the embedder's model and width; null when there is no model. */
  readonly collection: string | null;
  upsert(
    points: readonly { id: string; vector: readonly number[]; payload: PointPayload }[],
  ): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  search(query: {
    vector: readonly number[];
    limit: number;
    filter: VisibilityFilter;
  }): Promise<{ id: string; score: number }[]>;
}

export interface MemoryPorts {
  records: RecordStore;
  spaces: SpaceStore;
  index: VectorIndex;
  embedder: Embedder;
  clock: Clock;
  ids: Ids;
  /** Where a fault the runtime recovers from is reported — a projection that failed, a point not removed. */
  warn: (message: string) => void;
}
