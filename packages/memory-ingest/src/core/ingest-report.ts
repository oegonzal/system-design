import type { IngestStatus, ManifestEntry, PlannedChunk } from './ports';
import { holdsNoFacts } from './record';
import type { Retraction } from './retract';

/**
 * What an ingest run reports, chunk by chunk and document by document: the
 * outcome each chunk reads as, the rows and file reports `runIngest` fills in
 * as it goes, and the run's own counts and stops. `render.ts` prints it, and
 * `--json` prints it as it is.
 */

/** Why a run stopped early though nothing was wrong. */
export const HALT_REASONS = ['limit', 'interrupted'] as const;
export type HaltReason = (typeof HALT_REASONS)[number];

export const CHUNK_OUTCOMES = [
  'posted',
  'no-facts',
  'unstored',
  'skipped',
  'failed',
  'refused',
  'pending',
] as const;
export type ChunkOutcome = (typeof CHUNK_OUTCOMES)[number];

/** The outcome a posting's recorded status reads as in the report. */
const OUTCOME_OF: Record<IngestStatus, ChunkOutcome> = {
  complete: 'posted',
  unstored: 'unstored',
  failed: 'failed',
  refused: 'refused',
};

/** A posting's outcome in the report: its status's, an `unstored` one whose chunk holds no fact to store read as `no-facts`. */
export const outcomeOf = (entry: ManifestEntry): ChunkOutcome =>
  holdsNoFacts(entry) ? 'no-facts' : OUTCOME_OF[entry.status];

export interface ChunkReport {
  index: number;
  of: number;
  chunkHash: string;
  bytes: number;
  parts: number;
  context: string | null;
  /**
   * `pending` is a chunk not posted: a dry run, or one after the run stopped;
   * `no-facts` a posting the loop settled with nothing stored because the
   * chunk holds no fact to store, which covers the chunk as `posted` does.
   */
  outcome: ChunkOutcome;
  orchestrationRunId: string | null;
  status: IngestStatus | null;
  /** The steps of the record this row rests on — the posting, or the earlier one it was skipped for. */
  steps: ManifestEntry['steps'] | null;
  error: string | null;
}

export interface FileReport {
  document: string;
  parts: number;
  chunks: ChunkReport[];
  /**
   * The document's other digests, retracted once every chunk of its current
   * plan was covered; null when the plan was not covered whole in this run — a
   * dry run, a halt or a stop before its last chunk, a chunk not covered — so
   * nothing of the document was taken out.
   */
  replaced: Retraction | null;
  /**
   * Why the replacement was held back, for a document the run reached and did
   * not cover whole: the first chunk not covered — pending, or a posting that
   * did not cover it — and how many earlier digest runs outside the current
   * plan still stand: recorded before this run and not marked, the runs the
   * replacement retracts once a run covers every chunk. Null when the
   * replacement ran, under a dry run, and for a document the run never reached.
   */
  heldBack: { chunk: number; outcome: ChunkOutcome; earlierRuns: number } | null;
  /** The document's entries no digest run is known for (`unresolvedOf`), which no replacement can retract; 0 for a document the run did not reach. */
  unresolved: number;
}

export interface IngestReport {
  dryRun: boolean;
  /**
   * Whether covered chunks were posted again. A forced run that ends short is
   * taken up one of two ways: without --force, which posts only what is not
   * covered — so the chunks it did not reach keep their earlier digests, and
   * only the ones it posted again are replaced — or with it, which posts each
   * document whole again.
   */
  force: boolean;
  files: FileReport[];
  chunks: number;
  /** Chunks whose facts the loop stored. */
  posted: number;
  /** Chunks the loop settled with nothing stored because they hold no fact to store: covered, as a posted one is. */
  noFacts: number;
  /** Chunks the loop settled with their facts left out of the store — what, with `failed`, makes the exit code 1. */
  unstored: number;
  skipped: number;
  /** Failed and refused together. */
  failed: number;
  /**
   * Set when the run stopped on an answer the next chunk would meet too — a
   * refusal, or a start still unreachable past the client's recovery window —
   * before every chunk was posted.
   */
  stopped: { document: string; chunk: number; message: string } | null;
  /**
   * Set when the run halted as asked, with chunks still to reach, rather than
   * by a refusal — the limit was reached, or the operator interrupted. The
   * chunks not reached stay `pending`, and re-running the same command posts
   * whatever is not covered yet. A forced run is re-run without --force to
   * keep what it posted, which leaves the chunks it did not reach on their
   * earlier digests, or with --force to post each document whole again. A
   * limit or an interrupt met at the last chunk halts nothing: the run has
   * ended.
   */
  halted: { reason: HaltReason; after: number } | null;
}

/** A chunk's row before the run reaches it: `pending`, nothing recorded yet. */
export const reportOf = (planned: PlannedChunk): ChunkReport => ({
  index: planned.chunk.chunk.index,
  of: planned.chunk.chunk.of,
  chunkHash: planned.chunkHash,
  bytes: planned.bytes,
  parts: planned.chunk.parts.length,
  context: planned.chunk.context,
  outcome: 'pending',
  orchestrationRunId: null,
  status: null,
  steps: null,
  error: null,
});

/** The row as the record it rests on says — a fresh posting, or the earlier one it was skipped for. */
export const settle = (row: ChunkReport, entry: ManifestEntry, outcome: ChunkOutcome): void => {
  Object.assign(row, {
    outcome,
    orchestrationRunId: entry.orchestrationRunId,
    status: entry.status,
    steps: entry.steps,
    error: entry.error,
  });
};
