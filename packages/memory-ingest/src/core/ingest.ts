import { basename, relative, resolve } from 'node:path';

import { DOCUMENT_TITLE_MAX_LENGTH } from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import type { IngestKind } from '../config';
import { chunkDocument, type ChunkPlan } from './chunk';
import {
  IngestWaitFailed,
  type Clock,
  type DocumentReader,
  type IngestLedger,
  type IngestSink,
  type IngestStatus,
  type ManifestEntry,
  type PlannedChunk,
} from './ports';
import { entryOf, identityOf, statusOf } from './record';

/**
 * The ingest, in two phases. `planIngest` reads and chunks every document
 * before anything is posted, so an unreadable file or a part that cannot fit
 * refuses the whole run up front. `runIngest` then posts one chunk at a time,
 * awaiting each orchestration to settle before the next, and records every
 * outcome in the ledger. A chunk whose facts the ledger holds as stored is
 * skipped unless forced — and a forced document is digested again whole:
 * every digest the ledger holds as stored for that document is retracted by
 * its run id before the document's first chunk is posted, so the store never
 * holds two digests of one document. Retraction goes by the document, not by
 * the chunk hash, because the hash is of the rendered goal, and a change to
 * the goal's rules renames every chunk at once (measured 2026-10-13: a forced
 * résumé re-ingest after a rules change retracted nothing and left 48 facts
 * beside their 50 replacements). A refusal from the loop stops the run,
 * because the next chunk would be refused the same way.
 */
export interface IngestOptions {
  kind: IngestKind;
  subject: string;
  chunkBytes: number;
  /** The most sections one chunk may carry. */
  partsPerChunk: number;
  /** The day the documents speak for; null when nothing says. */
  date: string | null;
  /**
   * Post at most this many chunks this run, then halt with the rest pending;
   * null for every chunk. A run of one proves a document end to end — and
   * records that chunk by its hash, so the full run skips it rather than
   * digesting the same sections a second time into near-identical points.
   */
  limit: number | null;
  dryRun: boolean;
  force: boolean;
  /** Paths are recorded relative to this. */
  cwd: string;
}

export interface IngestDeps {
  reader: DocumentReader;
  /** Asked between chunks; true halts the run with what it has recorded. Absent never halts. */
  interrupted?: () => boolean;
  sink: IngestSink;
  ledger: IngestLedger;
  clock: Clock;
  /** Stamped on every record, so a manifest says which loop it speaks of. */
  loopUrl: string;
}

/** Why a run stopped early though nothing was wrong. */
export const HALT_REASONS = ['limit', 'interrupted'] as const;
export type HaltReason = (typeof HALT_REASONS)[number];

export const CHUNK_OUTCOMES = [
  'posted',
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

export interface ChunkReport {
  index: number;
  of: number;
  chunkHash: string;
  bytes: number;
  parts: number;
  context: string | null;
  /** `pending` is a chunk not posted: a dry run, or one after the run stopped. */
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
}

export interface IngestReport {
  dryRun: boolean;
  files: FileReport[];
  chunks: number;
  /** Chunks whose facts the loop stored. */
  posted: number;
  /** Chunks the loop settled without storing anything for — what, with `failed`, makes the exit code 1. */
  unstored: number;
  skipped: number;
  /** Failed and refused together. */
  failed: number;
  /** Digest runs retracted before a forced document was posted again: everything its earlier digests had stored, gone. */
  retracted: number;
  /** Set when a refusal stopped the run before every chunk was posted. */
  stopped: { document: string; chunk: number; message: string } | null;
  /**
   * Set when the run halted as asked rather than by a refusal — the limit was
   * reached, or the operator interrupted. The chunks not reached stay
   * `pending`, and re-running the same command posts them.
   */
  halted: { reason: HaltReason; after: number } | null;
}

export interface PlannedDocument {
  document: string;
  plan: ChunkPlan;
}

/** Statuses a re-run does not post again: the chunk's facts are in the store. */
const INGESTED: ReadonlySet<IngestStatus> = new Set(['complete']);

/** The digest runs a document's stored postings went through, each once, in the order recorded. */
const storedDigestsOf = (entries: readonly ManifestEntry[], document: string): string[] => [
  ...new Set(
    entries.flatMap((entry) =>
      entry.document === document && INGESTED.has(entry.status) && entry.digestRunId !== null
        ? [entry.digestRunId]
        : [],
    ),
  ),
];

/** Start failures that are an outcome of one chunk, not a fault in the program. */
const START_FAILURES = [LoopUnreachable, LoopTimeout] as const;

/** A file name past the contract's title bound, refused by name rather than by the schema's raw issue. */
export class DocumentNameTooLong extends Error {
  override readonly name = 'DocumentNameTooLong';
  constructor(
    readonly path: string,
    length: number,
  ) {
    super(
      `${path}: the file name is ${length} characters; a document title may be at most ${DOCUMENT_TITLE_MAX_LENGTH}`,
    );
  }
}

/** Phase one: every document read and chunked, nothing posted. Throws on anything it cannot use. */
export async function planIngest(
  paths: readonly string[],
  options: Pick<
    IngestOptions,
    'kind' | 'subject' | 'chunkBytes' | 'partsPerChunk' | 'date' | 'cwd'
  >,
  deps: Pick<IngestDeps, 'reader'>,
): Promise<PlannedDocument[]> {
  const planned: PlannedDocument[] = [];
  for (const path of paths) {
    const absolute = resolve(options.cwd, path);
    const title = basename(absolute);
    if (title.length > DOCUMENT_TITLE_MAX_LENGTH) throw new DocumentNameTooLong(path, title.length);
    const text = await deps.reader.read(absolute);
    planned.push({
      document: relative(options.cwd, absolute),
      plan: chunkDocument({
        text,
        kind: options.kind,
        title,
        subject: options.subject,
        date: options.date,
        chunkBytes: options.chunkBytes,
        partsPerChunk: options.partsPerChunk,
      }),
    });
  }
  return planned;
}

/** The latest outcome per chunk hash — what a re-run reads. */
export function latestByHash(
  entries: readonly ManifestEntry[],
): ReadonlyMap<string, ManifestEntry> {
  return new Map(entries.map((entry) => [entry.chunkHash, entry]));
}

/** Post one chunk and say how it ended. Anything but a loop outcome is a fault and propagates. */
async function postOne(
  planned: PlannedChunk,
  document: string,
  deps: IngestDeps,
): Promise<ManifestEntry> {
  const base = {
    identity: identityOf(planned, document),
    ingestedAt: deps.clock.now(),
    loopUrl: deps.loopUrl,
  };
  try {
    const orchestration = await deps.sink.post(planned);
    return entryOf({
      ...base,
      orchestrationRunId: orchestration.orchestrationRunId,
      orchestration,
      status: statusOf(orchestration),
      error: orchestration.error?.message ?? null,
    });
  } catch (error) {
    if (error instanceof LoopRefused) {
      const message = `${error.status}: ${error.message}`;
      return entryOf({
        ...base,
        orchestrationRunId: null,
        orchestration: null,
        status: 'refused',
        error: message,
      });
    }
    if (error instanceof IngestWaitFailed) {
      return entryOf({
        ...base,
        orchestrationRunId: error.orchestrationRunId,
        orchestration: null,
        status: 'failed',
        error: error.cause.message,
      });
    }
    if (START_FAILURES.some((kind) => error instanceof kind)) {
      const message = (error as Error).message;
      return entryOf({
        ...base,
        orchestrationRunId: null,
        orchestration: null,
        status: 'failed',
        error: message,
      });
    }
    throw error;
  }
}

const reportOf = (planned: PlannedChunk): ChunkReport => ({
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
const settle = (row: ChunkReport, entry: ManifestEntry, outcome: ChunkOutcome): void => {
  Object.assign(row, {
    outcome,
    orchestrationRunId: entry.orchestrationRunId,
    status: entry.status,
    steps: entry.steps,
    error: entry.error,
  });
};

/** Phase two: one chunk at a time, each awaited to settle and recorded, in document order. */
export async function runIngest(
  documents: readonly PlannedDocument[],
  options: Pick<IngestOptions, 'dryRun' | 'force' | 'limit'>,
  deps: IngestDeps,
): Promise<IngestReport> {
  const entries = [...(await deps.ledger.load())];
  // Kept current through the run, so a chunk met twice in one invocation is posted once.
  const known = new Map(latestByHash(entries));
  const files: FileReport[] = documents.map(({ document, plan }) => ({
    document,
    parts: plan.parts,
    chunks: plan.chunks.map(reportOf),
  }));
  const report: IngestReport = {
    dryRun: options.dryRun,
    files,
    chunks: files.reduce((sum, file) => sum + file.chunks.length, 0),
    posted: 0,
    unstored: 0,
    skipped: 0,
    failed: 0,
    retracted: 0,
    stopped: null,
    halted: null,
  };
  // Skipped chunks cost nothing, so they do not count against a limit.
  let posted = 0;

  for (const [fileIndex, { document, plan }] of documents.entries()) {
    // A forced document goes whole: what every earlier digest of it stored goes before its first chunk is posted.
    if (options.force && !options.dryRun && report.stopped === null && report.halted === null) {
      for (const digestRunId of storedDigestsOf(entries, document)) {
        await deps.sink.retract(digestRunId);
        report.retracted += 1;
      }
    }
    for (const [chunkIndex, planned] of plan.chunks.entries()) {
      if (report.stopped !== null || report.halted !== null) return report;
      const row = (files[fileIndex] as FileReport).chunks[chunkIndex] as ChunkReport;
      const prior = known.get(planned.chunkHash);
      if (prior !== undefined && INGESTED.has(prior.status) && !options.force) {
        settle(row, prior, 'skipped');
        report.skipped += 1;
        continue;
      }
      if (options.dryRun) continue;

      const entry = await postOne(planned, document, deps);
      entries.push(entry);
      known.set(entry.chunkHash, entry);
      await deps.ledger.save(entries);
      const outcome = OUTCOME_OF[entry.status];
      settle(row, entry, outcome);
      if (outcome === 'posted') report.posted += 1;
      else if (outcome === 'unstored') report.unstored += 1;
      else report.failed += 1;
      if (outcome === 'refused') {
        report.stopped = { document, chunk: planned.chunk.chunk.index, message: entry.error ?? '' };
      }
      posted += 1;
      if (options.limit !== null && posted >= options.limit) {
        report.halted = { reason: 'limit', after: posted };
      } else if (deps.interrupted?.() === true) {
        report.halted = { reason: 'interrupted', after: posted };
      }
    }
  }
  return report;
}

/** Both phases: plan every document, then post. */
export async function ingest(
  paths: readonly string[],
  options: IngestOptions,
  deps: IngestDeps,
): Promise<IngestReport> {
  return runIngest(await planIngest(paths, options, deps), options, deps);
}
