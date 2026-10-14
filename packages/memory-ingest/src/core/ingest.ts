import { basename, resolve } from 'node:path';

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
import { documentKey, entryOf, identityOf, loopError, statusOf, stored } from './record';
import { retractRuns, type Retraction } from './retract';

/**
 * The ingest, in two phases. `planIngest` reads and chunks every document
 * before anything is posted, so an unreadable file or a part that cannot fit
 * refuses the whole run up front. `runIngest` then posts one chunk at a time,
 * awaiting each orchestration to settle before the next, and records every
 * outcome in the ledger. A chunk whose facts the ledger holds as stored is
 * skipped unless forced.
 *
 * A document's digests follow its current text, make before break: once every
 * chunk of its current plan is stored — posted complete in this run, or
 * skipped for a posting that stands — every other digest the ledger holds as
 * stored for that document is retracted by its run id and marked. So an edit
 * replaces only the chunks it changed, a forced document is posted whole
 * before anything of it is taken out, and a document the run did not store
 * whole — halted, refused, failed — keeps everything it had. Replacement goes
 * by the document, not by the chunk hash, because the hash is of the rendered
 * goal, and a change to the goal's rules renames every chunk at once
 * (measured 2026-10-13: a forced résumé re-ingest after a rules change
 * matched no hash and left 48 facts beside their 50 replacements). A document
 * that read as no text replaces nothing: retiring one is `retract`'s.
 *
 * A refusal from the loop, or a start still unreachable once the client's
 * recovery window has passed, stops the run, because the next chunk would
 * meet the same answer.
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
  /**
   * The document's other digests, retracted once every chunk of its current
   * plan was stored; null when the plan was not stored whole in this run — a
   * dry run, a halt or a stop before its last chunk, a chunk not stored — so
   * nothing of the document was taken out.
   */
  replaced: Retraction | null;
}

export interface IngestReport {
  dryRun: boolean;
  /** Whether stored chunks were posted again: a forced run that ends short resumes without --force, which skips what it stored. */
  force: boolean;
  files: FileReport[];
  chunks: number;
  /** Chunks whose facts the loop stored. */
  posted: number;
  /** Chunks the loop settled without storing anything for — what, with `failed`, makes the exit code 1. */
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
   * chunks not reached stay `pending`, and re-running the command posts them:
   * the same command, or without --force when this one was forced, since what
   * it posted is stored. A limit or an interrupt met at the last chunk halts
   * nothing: the run has ended.
   */
  halted: { reason: HaltReason; after: number } | null;
}

export interface PlannedDocument {
  document: string;
  plan: ChunkPlan;
}

/** The digest runs a document's standing postings went through, each once, in the order recorded. */
const storedDigestsOf = (entries: readonly ManifestEntry[], document: string): string[] => [
  ...new Set(
    entries.flatMap((entry) =>
      entry.document === document && stored(entry) && entry.digestRunId !== null
        ? [entry.digestRunId]
        : [],
    ),
  ),
];

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
      document: documentKey(path, options.cwd),
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

/** A posting's record, and whether the run stops on it. */
interface Posting {
  entry: ManifestEntry;
  /** The next chunk would meet the same answer: a refusal, or a start unreachable past the recovery window. */
  stops: boolean;
}

/** Post one chunk and say how it ended. Anything but a loop outcome is a fault and propagates. */
async function postOne(
  planned: PlannedChunk,
  document: string,
  deps: IngestDeps,
): Promise<Posting> {
  const base = {
    identity: identityOf(planned, document),
    ingestedAt: deps.clock.now(),
    loopUrl: deps.loopUrl,
    // A fresh posting stands until a retraction marks it.
    retractedAt: null,
    retractedPoints: null,
  };
  /** The record of a posting the loop never settled: refused, unreachable, unanswered, or lost mid-wait. */
  const unsettled = (
    status: IngestStatus,
    orchestrationRunId: string | null,
    error: string,
  ): ManifestEntry => entryOf({ ...base, orchestrationRunId, orchestration: null, status, error });
  try {
    const orchestration = await deps.sink.post(planned);
    const entry = entryOf({
      ...base,
      orchestrationRunId: orchestration.orchestrationRunId,
      orchestration,
      status: statusOf(orchestration),
      error: orchestration.error?.message ?? null,
    });
    return { entry, stops: false };
  } catch (error) {
    if (error instanceof LoopRefused) {
      return { entry: unsettled('refused', null, loopError(error)), stops: true };
    }
    if (error instanceof IngestWaitFailed) {
      const entry = unsettled('failed', error.orchestrationRunId, error.cause.message);
      return { entry, stops: false };
    }
    // The client rides a restarting loop out within its recovery window: a start
    // still unreachable past it would hold every chunk after it for the same window.
    if (error instanceof LoopUnreachable) {
      return { entry: unsettled('failed', null, error.message), stops: true };
    }
    if (error instanceof LoopTimeout) {
      return { entry: unsettled('failed', null, error.message), stops: false };
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
  let entries = await deps.ledger.load();
  // Kept current through the run, so a chunk met twice in one invocation is posted once.
  let known = new Map(latestByHash(entries));
  const files: FileReport[] = documents.map(({ document, plan }) => ({
    document,
    parts: plan.parts,
    chunks: plan.chunks.map(reportOf),
    replaced: null,
  }));
  const report: IngestReport = {
    dryRun: options.dryRun,
    force: options.force,
    files,
    chunks: files.reduce((sum, file) => sum + file.chunks.length, 0),
    posted: 0,
    unstored: 0,
    skipped: 0,
    failed: 0,
    stopped: null,
    halted: null,
  };
  // Skipped chunks cost nothing, so they do not count against a limit.
  let posted = 0;
  // Chunks reached, skipped or posted, across every document: a halt leaves the rest pending.
  let reached = 0;

  for (const [fileIndex, { document, plan }] of documents.entries()) {
    const file = files[fileIndex] as FileReport;
    // The digest runs the current plan stands on, chunk by chunk; null once one is not stored, or under a dry run.
    let standing: Set<string> | null = plan.chunks.length > 0 && !options.dryRun ? new Set() : null;
    for (const [chunkIndex, planned] of plan.chunks.entries()) {
      if (report.stopped !== null || report.halted !== null) return report;
      reached += 1;
      const row = file.chunks[chunkIndex] as ChunkReport;
      const prior = known.get(planned.chunkHash);
      if (prior !== undefined && stored(prior) && !options.force) {
        settle(row, prior, 'skipped');
        report.skipped += 1;
        if (prior.digestRunId !== null) standing?.add(prior.digestRunId);
        continue;
      }
      if (options.dryRun) continue;

      const { entry, stops } = await postOne(planned, document, deps);
      entries = [...entries, entry];
      known.set(entry.chunkHash, entry);
      await deps.ledger.save(entries);
      const outcome = OUTCOME_OF[entry.status];
      settle(row, entry, outcome);
      if (outcome === 'posted') report.posted += 1;
      else if (outcome === 'unstored') report.unstored += 1;
      else report.failed += 1;
      if (!stored(entry)) standing = null;
      else if (entry.digestRunId !== null) standing?.add(entry.digestRunId);
      if (stops) {
        report.stopped = { document, chunk: planned.chunk.chunk.index, message: entry.error ?? '' };
      }
      posted += 1;
      // A halt leaves chunks pending; at the run's last chunk there are none, and the run simply ends.
      if (reached === report.chunks) continue;
      if (options.limit !== null && posted >= options.limit) {
        report.halted = { reason: 'limit', after: posted };
      } else if (deps.interrupted?.() === true) {
        report.halted = { reason: 'interrupted', after: posted };
      }
    }
    if (standing === null) continue;
    // Make before break: every chunk of the current plan is stored, so what else of the document stands goes.
    const current = standing;
    const replaced = storedDigestsOf(entries, document).filter((run) => !current.has(run));
    const done = await retractRuns(entries, replaced, deps);
    entries = done.entries;
    known = new Map(latestByHash(entries));
    file.replaced = done.retraction;
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
