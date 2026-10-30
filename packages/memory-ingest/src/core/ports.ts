import type {
  DocumentChunk,
  DocumentKind,
  ExperienceProfileDto,
  OrchestrationStepStatus,
  QualityRunStatus,
  RecordScope,
  StarStoryDto,
} from '@sysdesign/contracts';

/**
 * What the ingester needs from the world, as ports. The core reads a
 * document, chunks it, hands each chunk to a sink and records the outcome;
 * where the text comes from, which store takes the chunk and where the record
 * lives are adapters, chosen in `cli.ts`.
 */

/** A document's text. A reader that cannot read the path throws, naming why. */
export interface DocumentReader {
  read(path: string): Promise<string>;
}

/** Documents kept at paths: one written whole, the folders above it made as needed, or one removed. */
export interface DocumentWriter {
  write(path: string, text: string): Promise<void>;
  /** The document at a path gone — true when there was one to remove, false when the path held none. */
  remove(path: string): Promise<boolean>;
}

/**
 * The studio's lists, each read whole: every experience profile — the
 * subject's own and the examples written for practice alike — and every STAR
 * story. Which of them is the subject's record is the export's to decide.
 */
export interface StudioSource {
  experiences(): Promise<readonly ExperienceProfileDto[]>;
  stories(): Promise<readonly StarStoryDto[]>;
}

/** One chunk as it will be posted: the contract shape, the goal it renders to, and the hash that names it. */
export interface PlannedChunk {
  chunk: DocumentChunk;
  goal: string;
  /** sha256 hex of `goal` — the chunk's identity in the manifest. */
  chunkHash: string;
  /** UTF-8 bytes of `goal`, the budget the packer held it under. */
  bytes: number;
}

/**
 * The stores a chunk may be posted to: the quality loop's own memory store,
 * through its document-memory orchestrator, or a memory space on the memory
 * host, through a digest it applies. Each posting records which it went
 * through, and every command acts on the postings made through the one it is
 * configured for.
 */
export const INGEST_SINKS = ['loop', 'space'] as const;
export type IngestSinkKind = (typeof INGEST_SINKS)[number];

/**
 * The two phases every posting goes through, as the manifest summarizes them:
 * the digest that judges the chunk into facts, and the store that keeps what
 * the digest endorsed. The loop runs both as steps of its orchestration; a
 * space runs the digest on the loop and the store is the sink's own apply.
 */
export const POSTING_STEPS = ['digest', 'store'] as const;
export type PostingStep = (typeof POSTING_STEPS)[number];

/**
 * Why a space posting's store step kept nothing, or not everything, beyond
 * what its digest step says — the ingest's own reasons for the step it runs
 * itself. `nothing-endorsed`: the digest left nothing to apply, its own step
 * saying why. `not-applied`: the digest settled with memories to apply and
 * the apply never happened — the wait was lost after the start, or the
 * process ended first. `items-refused`: applied, and the runtime refused one
 * or more of the endorsed memories, so facts of the chunk are not in the store.
 */
export const STORE_STEP_REASONS = ['nothing-endorsed', 'not-applied', 'items-refused'] as const;
export type StoreStepReason = (typeof STORE_STEP_REASONS)[number];

export interface ManifestStep {
  status: OrchestrationStepStatus;
  reason: string | null;
  /** The detail behind the reason, as the step gave it — an availability note, the upstream step that blocked. */
  note: string | null;
  counts: Record<string, number>;
}

/**
 * What a posting came to, as either sink reports it: the run the sink
 * started, whether it still runs, the digest's child run, the two steps as
 * the manifest summarizes them, why a failed run failed, and the records the
 * store left current. The loop names no records — its points carry the digest
 * run's id, and that is what a retraction names — so a loop posting's list
 * is empty.
 */
export interface PostingOutcome {
  orchestrationRunId: string;
  status: QualityRunStatus;
  /** The digest step's child run — the run whose id names the loop's stored points, or the register digest a space applied. */
  digestRunId: string | null;
  steps: Record<PostingStep, ManifestStep | null>;
  /** Why a failed run failed; null otherwise. */
  error: string | null;
  recordIds: string[];
}

/**
 * How a sink fails a call, as the core reads it: the sink translates its
 * client's own errors into one of these, so the core decides what to record
 * and whether to go on from the kind alone, never from a message. `refused`:
 * the service answered and would not do it — the next chunk would meet the
 * same answer. `unreachable`: nobody answered within the client's recovery —
 * the same. `timeout`: the service held the call past its time. `unfinished`:
 * the posting was started and did not reach its end — the wait for it lost,
 * or what it endorsed not applied — so the record keeps the run's id.
 */
export type SinkFaultKind = 'refused' | 'unreachable' | 'timeout' | 'unfinished';

export class SinkFault extends Error {
  override readonly name = 'SinkFault';
  constructor(
    readonly kind: SinkFaultKind,
    message: string,
    /** The run the sink started before it failed; null when none was. */
    readonly orchestrationRunId: string | null = null,
  ) {
    super(message);
  }
}

/**
 * A store, as the ingester uses it: post one chunk and wait for it to come to
 * its end, read a posting back, and take out what a posting stored. A call the
 * sink cannot carry out is a `SinkFault`; anything else it throws is a fault
 * in the program. A sink is asked only about postings made through the store
 * it is — its kind, and for a space the space and the scope it writes under
 * (`sameStore`): the core keeps every other store's apart.
 */
export interface IngestSink {
  readonly kind: IngestSinkKind;
  /** The service's base URL, as every posting records where it went. */
  readonly host: string;
  /** The space every posting goes to; null for the loop, whose store has none. */
  readonly spaceId: string | null;
  /** The scope every posting goes under — the tenant's partition, for a space; null for the loop, whose store has none. */
  readonly scope: RecordScope | null;
  post(planned: PlannedChunk): Promise<PostingOutcome>;
  /** The posting as the service has it now, or null when it no longer does. */
  status(entry: ManifestEntry): Promise<PostingOutcome | null>;
  /**
   * What the posting stored, gone — how many memories went; a posting the
   * store holds nothing of removes nothing. `keep` names the records another
   * standing posting through this store lists too — a fact two postings
   * answered is one record — which stay current, whatever this posting lists.
   */
  retract(entry: ManifestEntry, keep: ReadonlySet<string>): Promise<number>;
}

/**
 * How a chunk's posting ended. `complete` is earned by the store step: what
 * the digest endorsed is in the store — every fact of the chunk, unless a
 * step's reason says some were left out (`leftFactsOut`). `unstored` is a
 * run that settled without storing any — embeddings disabled, the store
 * unavailable, the digest judged and not accepted or finding nothing — which
 * the loop's runner still marks complete, since no step failed. `failed`
 * never settled or settled failed; `refused` never started.
 */
export const INGEST_STATUSES = ['complete', 'unstored', 'failed', 'refused'] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

/** One outcome, as recorded. The ledger keeps every outcome in order; the latest per hash is what a re-run reads. */
export interface ManifestEntry {
  chunkHash: string;
  /** The document's path, relative to the working directory the ingest ran in. */
  document: string;
  chunk: { index: number; of: number };
  kind: DocumentKind;
  /** Which store the chunk was posted to. */
  sink: IngestSinkKind;
  /** The service the posting went through, by its base URL. */
  host: string;
  /** The space the posting went to; null for a loop posting. */
  spaceId: string | null;
  /** The scope a space posting wrote under; null for a loop posting, and for a space posting recorded before the manifest kept it. */
  scope: RecordScope | null;
  orchestrationRunId: string | null;
  /** The digest step's child run — the run whose id names the loop's stored points. */
  digestRunId: string | null;
  /** The records a space posting left current, as its apply answered them; empty for a loop posting. */
  recordIds: string[];
  status: IngestStatus;
  /** Null for a step the run never reported. */
  steps: Record<PostingStep, ManifestStep | null>;
  /** Why a `failed` or `refused` posting ended that way; null otherwise — an `unstored` one is explained by its steps. */
  error: string | null;
  ingestedAt: string;
  /**
   * When what this posting stored was retracted — replaced by a later digest
   * of the document, or the document retired; null while it stands.
   */
  retractedAt: string | null;
  /** How many memories that retraction removed — 0 when the store held none of them by then; null while it stands. */
  retractedPoints: number | null;
}

/** Where outcomes are kept. `save` replaces the whole ledger, atomically. */
export interface IngestLedger {
  /** Where the ledger is kept, as a refusal names it. */
  readonly path: string;
  load(): Promise<readonly ManifestEntry[]>;
  save(entries: readonly ManifestEntry[]): Promise<void>;
  /**
   * Make this process the ledger's one writer until the answer is called. A
   * ledger another command holds is refused, naming what holds it: `save`
   * replaces the whole ledger, so a second writer would overwrite what the
   * first recorded — its postings, or the marks of what it retracted.
   */
  lock(): Promise<() => Promise<void>>;
}

export interface Clock {
  /** Now, as an ISO timestamp. */
  now(): string;
}
