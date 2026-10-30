import { basename, resolve } from 'node:path';

import { DOCUMENT_TITLE_MAX_LENGTH, type MemoryScope } from '@sysdesign/contracts';

import type { IngestKind } from '../config';
import { chunkDocument, type ChunkPlan } from './chunk';
import {
  outcomeOf,
  reportOf,
  settle,
  type ChunkReport,
  type FileReport,
  type IngestReport,
} from './ingest-report';
import {
  SinkFault,
  type Clock,
  type DocumentReader,
  type IngestLedger,
  type IngestSink,
  type IngestStatus,
  type ManifestEntry,
  type PlannedChunk,
  type SinkFaultKind,
} from './ports';
import {
  covers,
  documentKey,
  entryOf,
  identityOf,
  originOf,
  statusOf,
  throughStore,
  type StoreIdentity,
} from './record';
import { replaceDocument, replacedRunsOf, unresolvedOf } from './retract';

/**
 * The ingest, in two phases. `planIngest` reads and chunks every document
 * before anything is posted, so an unreadable file or a part that cannot fit
 * refuses the whole run up front. `runIngest` then posts one chunk at a time,
 * awaiting each posting to come to its end before the next, and records every
 * outcome in the ledger. A chunk its document's latest posting of it covers —
 * its facts stored, or none to store (`covers`) — is skipped unless forced. A
 * document reads its own postings alone, found by its key and the chunk's
 * hash among the postings made through the configured store — the sink, and
 * for a space the space and the scope written under — so the same text in two
 * documents is posted once for each, a document posted to one store is posted
 * again to the other, the same document seeded under two tenants is posted
 * under each, and nothing one document replaces or retires is a fact another
 * stands on.
 *
 * A document's digests follow its current text, make before break: once every
 * chunk of its current plan is covered — posted in this run, or skipped for a
 * posting of its own that stands — every other digest run its entries through
 * this sink name is retracted by its id and marked, by the rule retiring a
 * document goes by (`replacedRunsOf`). So an edit that keeps its chunks'
 * hashes replaces only the chunks it changed, a forced document is posted
 * whole before anything of it is taken out, and a document the run did not
 * cover whole — halted, refused, failed, or a chunk whose facts the digest
 * left out of the store — keeps everything it had, its report naming the
 * chunk that held the replacement back. Replacement goes by the document, not
 * by the chunk hash, because the hash is of the rendered goal, and a change to
 * the goal's rules renames every chunk at once (measured 2026-10-13: a forced
 * résumé re-ingest after a rules change matched no hash and left 48 facts
 * beside their 50 replacements). A document that read as no text replaces
 * nothing: retiring one is `retract`'s.
 *
 * A refusal from the service, or a start still unreachable once the client's
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
   * The scope the documents declare for every memory they state, rendered
   * into each chunk's goal and stamped by the loop's store over the scope
   * test; null when they declare none, and each memory is then scoped by that
   * test. A space writes every memory under the tenant whatever this says.
   */
  scope: MemoryScope | null;
  /**
   * Post at most this many chunks this run, then halt with the rest pending;
   * null for every chunk. A run of one proves a document end to end — and
   * records that chunk under its document and hash, so the full run skips it
   * rather than digesting the same sections a second time into near-identical
   * memories.
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
}

export interface PlannedDocument {
  document: string;
  plan: ChunkPlan;
}

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
    'kind' | 'subject' | 'chunkBytes' | 'partsPerChunk' | 'date' | 'scope' | 'cwd'
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
        ...(options.scope === null ? {} : { scope: options.scope }),
        chunkBytes: options.chunkBytes,
        partsPerChunk: options.partsPerChunk,
      }),
    });
  }
  return planned;
}

/** Where a chunk's postings are found: under its document's key and its hash, so a document reads only its own. */
const chunkKey = (document: string, chunkHash: string): string =>
  JSON.stringify([document, chunkHash]);

/** The latest outcome of each chunk of each document through one store — what a re-run reads. */
export function latestByChunk(
  entries: readonly ManifestEntry[],
  store: StoreIdentity,
): ReadonlyMap<string, ManifestEntry> {
  return new Map(
    throughStore(entries, store).map((entry) => [chunkKey(entry.document, entry.chunkHash), entry]),
  );
}

/** A posting's record, and whether the run stops on it. */
interface Posting {
  entry: ManifestEntry;
  /** The next chunk would meet the same answer: a refusal, or a start unreachable past the recovery window. */
  stops: boolean;
}

/** What each kind of sink fault records: a refusal never started; the rest failed. */
const FAULT_STATUS: Record<SinkFaultKind, IngestStatus> = {
  refused: 'refused',
  unreachable: 'failed',
  timeout: 'failed',
  unfinished: 'failed',
};

/**
 * Which kinds of sink fault stop the run. A refusal would meet the next chunk
 * too; the client rides a restarting service out within its recovery window,
 * so a start still unreachable past it would hold every chunk after it for
 * the same window. A call held past its time, and a posting that did not reach
 * its end after the start, say nothing of the next chunk.
 */
const FAULT_STOPS: Record<SinkFaultKind, boolean> = {
  refused: true,
  unreachable: true,
  timeout: false,
  unfinished: false,
};

/** Post one chunk and say how it ended. Anything but a sink fault is a fault in the program and propagates. */
async function postOne(
  planned: PlannedChunk,
  document: string,
  deps: IngestDeps,
): Promise<Posting> {
  const base = {
    identity: identityOf(planned, document),
    origin: originOf(deps.sink),
    ingestedAt: deps.clock.now(),
    // A fresh posting stands until a retraction marks it.
    retractedAt: null,
    retractedPoints: null,
  };
  try {
    const outcome = await deps.sink.post(planned);
    const entry = entryOf({
      ...base,
      orchestrationRunId: outcome.orchestrationRunId,
      outcome,
      status: statusOf(outcome),
      error: outcome.error,
    });
    return { entry, stops: false };
  } catch (error) {
    if (!(error instanceof SinkFault)) throw error;
    // The record of a posting the service never brought to its end: refused, unreachable, unanswered, or lost after the start.
    const entry = entryOf({
      ...base,
      orchestrationRunId: error.orchestrationRunId,
      outcome: null,
      status: FAULT_STATUS[error.kind],
      error: error.message,
    });
    return { entry, stops: FAULT_STOPS[error.kind] };
  }
}

/** Phase two: one chunk at a time, each awaited to its end and recorded, in document order. */
export async function runIngest(
  documents: readonly PlannedDocument[],
  options: Pick<IngestOptions, 'dryRun' | 'force' | 'limit'>,
  deps: IngestDeps,
): Promise<IngestReport> {
  const store: StoreIdentity = deps.sink;
  let entries = await deps.ledger.load();
  // Entries before this index were recorded by earlier runs: postings append, and marks keep their place.
  const recordedBefore = entries.length;
  // Kept current through the run, so a chunk met twice in one invocation is posted once.
  let known = new Map(latestByChunk(entries, store));
  const files: FileReport[] = documents.map(({ document, plan }) => ({
    document,
    parts: plan.parts,
    chunks: plan.chunks.map(reportOf),
    replaced: null,
    heldBack: null,
    unresolved: 0,
  }));
  const report: IngestReport = {
    dryRun: options.dryRun,
    force: options.force,
    files,
    chunks: files.reduce((sum, file) => sum + file.chunks.length, 0),
    posted: 0,
    noFacts: 0,
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
    /** The posting that covers a chunk of this document as a re-run reads it — its latest, when that covers it. */
    const coverOf = (planned: PlannedChunk): ManifestEntry | null => {
      const latest = known.get(chunkKey(document, planned.chunkHash));
      return latest !== undefined && covers(latest) ? latest : null;
    };
    for (const [chunkIndex, planned] of plan.chunks.entries()) {
      if (report.stopped !== null || report.halted !== null) break;
      reached += 1;
      const row = file.chunks[chunkIndex] as ChunkReport;
      const prior = coverOf(planned);
      if (prior !== null && !options.force) {
        settle(row, prior, 'skipped');
        report.skipped += 1;
        continue;
      }
      if (options.dryRun) continue;

      const { entry, stops } = await postOne(planned, document, deps);
      entries = [...entries, entry];
      known.set(chunkKey(document, entry.chunkHash), entry);
      await deps.ledger.save(entries);
      const outcome = outcomeOf(entry);
      settle(row, entry, outcome);
      if (outcome === 'posted') report.posted += 1;
      else if (outcome === 'no-facts') report.noFacts += 1;
      else if (outcome === 'unstored') report.unstored += 1;
      else report.failed += 1;
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
    // A dry run replaces nothing, and neither does a document with no chunks or one the run stopped before.
    if (options.dryRun || file.chunks.every((row) => row.outcome === 'pending')) continue;
    // The digest runs the current plan stands on: each chunk's covering posting, reached or not.
    const standing = new Set(
      plan.chunks.flatMap((planned) => {
        const digestRunId = coverOf(planned)?.digestRunId ?? null;
        return digestRunId === null ? [] : [digestRunId];
      }),
    );
    const blocking = plan.chunks.findIndex(
      (planned, index) => file.chunks[index]?.outcome === 'pending' || coverOf(planned) === null,
    );
    if (blocking === -1) {
      // Make before break: every chunk of the current plan is covered, so what else of the document stands goes.
      const done = await replaceDocument(entries, document, standing, deps);
      entries = done.entries;
      known = new Map(latestByChunk(entries, store));
      file.replaced = done.retraction;
    } else {
      const row = file.chunks[blocking] as ChunkReport;
      file.heldBack = {
        chunk: row.index,
        outcome: row.outcome,
        earlierRuns: replacedRunsOf(entries.slice(0, recordedBefore), store, document, standing)
          .length,
      };
    }
    file.unresolved = unresolvedOf(entries, store, document);
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
