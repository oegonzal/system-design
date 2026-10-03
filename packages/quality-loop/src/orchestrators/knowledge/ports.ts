/**
 * The ports the knowledge orchestrator runs over: the memory orchestrator's
 * embeddings and store, bound to the same adapters by the orchestration module,
 * plus one of its own — where a run's claims about another run's items are
 * recorded.
 *
 * Reinforcement is rows rather than a counter on the point, and that is the
 * whole design: a run digested twice must replace its own claims and count
 * once, which a number you can only increment cannot do, and which two
 * orchestrations writing the same point would race on. The count a search reads
 * is derived from these rows and written onto the payload after every write, so
 * the rows are the truth and the payload is a cache of them.
 */
import type { MemoryPorts, PointRef } from '../memory/ports';

export type SupportKind = 'confirms' | 'contradicts';

/**
 * One run's claim about one stored item. `contentHash` is the item's text as the
 * claim was made against it: a point whose statement is later re-digested into
 * different words keeps its id and loses this support exactly, with no rule
 * reading either text.
 */
export interface SupportRow {
  point: PointRef;
  contentHash: string;
  kind: SupportKind;
  /** The digest run that wrote the claim; null when it is no longer known. */
  digestRunId: string | null;
}

/** How many runs have confirmed or contradicted one item, as a search reads it. */
export interface SupportCount {
  confirms: number;
  contradicts: number;
}

export interface SupportStore {
  /**
   * A source run's claims become exactly these: its earlier ones go, these are
   * written. One statement per run per point, so re-digesting a run converges
   * rather than accumulating. Returns how many stand.
   */
  replace(sourceRunId: string, rows: readonly SupportRow[]): Promise<number>;
  /**
   * How many runs claim each of these items, counting only claims made against
   * the text the item still carries. Keyed `${runId}|${ref}`.
   */
  countByPoint(
    points: readonly { point: PointRef; contentHash: string }[],
  ): Promise<Map<string, SupportCount>>;
  /** Every claim one source run has made; for the specs and for a reader of a run. */
  bySourceRun(sourceRunId: string): Promise<SupportRow[]>;
}

/** The key `countByPoint` answers under, so a caller never builds it by hand. */
export const supportKey = (point: PointRef): string => `${point.runId}|${point.ref}`;

export type KnowledgePorts = Pick<MemoryPorts, 'embedding' | 'embeddings' | 'store'> & {
  support: SupportStore;
};
