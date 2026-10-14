import type {
  DocumentChunk,
  DocumentKind,
  ExperienceProfileDto,
  OrchestrationRunDto,
  OrchestrationStepStatus,
  StarStoryDto,
} from '@sysdesign/contracts';

/**
 * What the ingester needs from the world, as ports. The core reads a
 * document, chunks it, hands each chunk to the loop and records the outcome;
 * where the text comes from, how the loop is reached and where the record
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
 * The loop, as the ingester uses it: post one chunk and wait for its
 * orchestration to settle. A start the loop refuses or cannot be reached for
 * throws the loop client's own error; a wait that fails after the start
 * throws `IngestWaitFailed`, so the record keeps the orchestration id.
 */
export interface IngestSink {
  post(planned: PlannedChunk): Promise<OrchestrationRunDto>;
  /** The orchestration as the loop has it now, or null when it no longer does. */
  status(orchestrationRunId: string): Promise<OrchestrationRunDto | null>;
  /** Every point a digest run stored, gone — how many went; a run the store never held removes nothing. */
  retract(digestRunId: string): Promise<number>;
}

export class IngestWaitFailed extends Error {
  override readonly name = 'IngestWaitFailed';
  constructor(
    readonly orchestrationRunId: string,
    override readonly cause: Error,
  ) {
    super(`orchestration ${orchestrationRunId} was not awaited to the end: ${cause.message}`);
  }
}

/**
 * How a chunk's posting ended. `complete` is earned by the store step: the
 * chunk's facts are in the store. `unstored` is an orchestration that settled
 * without storing any — embeddings disabled, the store unavailable, the digest
 * judged and not accepted or finding nothing — which the runner still marks
 * complete, since no step failed. `failed` never settled or settled failed;
 * `refused` never started.
 */
export const INGEST_STATUSES = ['complete', 'unstored', 'failed', 'refused'] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

/** The document-memory orchestrator's steps, as the manifest summarizes them. */
export const DOCUMENT_MEMORY_STEPS = ['digest', 'store'] as const;
export type DocumentMemoryStep = (typeof DOCUMENT_MEMORY_STEPS)[number];

export interface ManifestStep {
  status: OrchestrationStepStatus;
  reason: string | null;
  /** The detail behind the reason, as the step gave it — an availability note, the upstream step that blocked. */
  note: string | null;
  counts: Record<string, number>;
}

/** One outcome, as recorded. The ledger keeps every outcome in order; the latest per hash is what a re-run reads. */
export interface ManifestEntry {
  chunkHash: string;
  /** The document's path, relative to the working directory the ingest ran in. */
  document: string;
  chunk: { index: number; of: number };
  kind: DocumentKind;
  orchestrationRunId: string | null;
  /** The digest step's child run — the run whose id names the stored points. */
  digestRunId: string | null;
  status: IngestStatus;
  /** Null for a step the orchestration never reported. */
  steps: Record<DocumentMemoryStep, ManifestStep | null>;
  /** Why a `failed` or `refused` posting ended that way; null otherwise — an `unstored` one is explained by its steps. */
  error: string | null;
  ingestedAt: string;
  loopUrl: string;
  /**
   * When what this posting's digest run stored was retracted — replaced by a
   * later digest of the document, or the document retired; null while it stands.
   */
  retractedAt: string | null;
  /** How many points that retraction removed — 0 when the store held none of them by then; null while it stands. */
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
