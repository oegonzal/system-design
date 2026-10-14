import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import type { Clock, IngestLedger, IngestSink, ManifestEntry } from './ports';
import { documentKey, loopError, markRetracted } from './record';

/**
 * Retraction: what a digest run stored, taken out of the store by the run id
 * the manifest keeps, and every posting that names the run marked — when, and
 * how many points went. Two paths retract: an ingest replacing a document's
 * other digests once every chunk of its current plan is stored, and `retract`
 * retiring a document whole. Both go through `retractRuns`, which saves the
 * ledger after each retraction — a mark is on disk the moment its points are
 * gone, never behind the next posting's minutes — and stops at the first the
 * loop does not carry out, saying which runs it left standing and why.
 */

/** One digest run retracted, and how many points the store removed for it — 0 when it held none by then. */
interface RetractedRun {
  digestRunId: string;
  removed: number;
}

/** What one batch of retractions did. */
export interface Retraction {
  /** Each run retracted, in order. */
  retracted: RetractedRun[];
  /** The runs left standing — the one whose retraction failed, then those after it, never asked — and why; null when none failed. */
  left: { digestRunIds: string[]; error: string } | null;
}

export interface RetractDeps {
  sink: Pick<IngestSink, 'retract'>;
  ledger: IngestLedger;
  clock: Clock;
}

/**
 * A retraction the loop did not carry out — unreachable past the client's
 * recovery window, unanswered in time, or refused — is an outcome to report,
 * not a fault in the program.
 */
const RETRACT_FAILURES = [LoopUnreachable, LoopTimeout, LoopRefused] as const;

/** How many runs a batch left standing; none when it did not run. */
export const leftStanding = (retraction: Retraction | null): number =>
  retraction?.left?.digestRunIds.length ?? 0;

/**
 * Retract each run in turn, marking every posting that names it and saving
 * the ledger before the next. The first retraction the loop does not carry
 * out ends the batch, everything before it already saved; anything else is a
 * fault and propagates, the marks before it saved too.
 */
export async function retractRuns(
  entries: readonly ManifestEntry[],
  digestRunIds: readonly string[],
  deps: RetractDeps,
): Promise<{ entries: readonly ManifestEntry[]; retraction: Retraction }> {
  let marked = entries;
  const retracted: RetractedRun[] = [];
  for (const [index, digestRunId] of digestRunIds.entries()) {
    let removed: number;
    try {
      removed = await deps.sink.retract(digestRunId);
    } catch (error) {
      if (!RETRACT_FAILURES.some((kind) => error instanceof kind)) throw error;
      const left = { digestRunIds: digestRunIds.slice(index), error: loopError(error as Error) };
      return { entries: marked, retraction: { retracted, left } };
    }
    marked = markRetracted(marked, digestRunId, deps.clock.now(), removed);
    await deps.ledger.save(marked);
    retracted.push({ digestRunId, removed });
  }
  return { entries: marked, retraction: { retracted, left: null } };
}

/** Paths the manifest holds no entry for, refused by name before anything is retracted. */
export class NotInManifest extends Error {
  override readonly name = 'NotInManifest';
  constructor(
    readonly documents: readonly string[],
    manifest: string,
  ) {
    super(
      `${manifest} has no entry for ${documents.join(', ')}: a document is found by its path from the working directory it was ingested in, in the manifest it was ingested under`,
    );
  }
}

/** One document retired: the digest runs its entries name, and what retracting them did. */
export interface DocumentRetraction {
  document: string;
  /** Entries the manifest holds for the document, of every status. */
  entries: number;
  /** Runs every posting of which was marked before this command: retracted already, not asked again. */
  already: string[];
  /** Runs this command retracts — under --dry-run, the ones it would. */
  runs: string[];
  /** What retracting `runs` did; null under --dry-run. */
  retraction: Retraction | null;
  /**
   * Entries naming an orchestration whose report was never read — a wait lost
   * after the start — so no digest run is known to retract: what it stored, if
   * anything, is known once `status --refresh` reads it back from the loop.
   */
  unresolved: number;
}

export interface RetractReport {
  dryRun: boolean;
  documents: DocumentRetraction[];
}

/** What retiring a document asks of the store, read off its entries alone. */
function retirementOf(
  entries: readonly ManifestEntry[],
  document: string,
): Omit<DocumentRetraction, 'retraction'> {
  const own = entries.filter((entry) => entry.document === document);
  const named = [
    ...new Set(own.flatMap((entry) => (entry.digestRunId === null ? [] : [entry.digestRunId]))),
  ];
  const marked = (digestRunId: string): boolean =>
    own.every((entry) => entry.digestRunId !== digestRunId || entry.retractedAt !== null);
  return {
    document,
    entries: own.length,
    already: named.filter(marked),
    runs: named.filter((digestRunId) => !marked(digestRunId)),
    unresolved: own.filter(
      (entry) =>
        entry.orchestrationRunId !== null &&
        entry.digestRunId === null &&
        entry.steps.digest === null,
    ).length,
  };
}

/**
 * Retire documents: every digest run any entry of a document names, whatever
 * its status — retracting a run that stored nothing removes nothing — is
 * retracted and marked. A document is found by the key the ingest recorded it
 * under, from its path alone, and is never read, so a document deleted since
 * is retired all the same; a path the manifest holds no entry for refuses the
 * command before anything is retracted. The first retraction the loop does not
 * carry out leaves the rest standing — that document's, and every one after.
 */
export async function retractDocuments(
  paths: readonly string[],
  options: { dryRun: boolean; cwd: string },
  deps: RetractDeps,
): Promise<RetractReport> {
  let entries = await deps.ledger.load();
  const documents = [...new Set(paths.map((path) => documentKey(path, options.cwd)))];
  const missing = documents.filter(
    (document) => !entries.some((entry) => entry.document === document),
  );
  if (missing.length > 0) throw new NotInManifest(missing, deps.ledger.path);

  const report: RetractReport = { dryRun: options.dryRun, documents: [] };
  let failed: string | null = null;
  for (const document of documents) {
    const retirement = retirementOf(entries, document);
    if (options.dryRun) {
      report.documents.push({ ...retirement, retraction: null });
      continue;
    }
    if (failed !== null) {
      const left =
        retirement.runs.length === 0 ? null : { digestRunIds: retirement.runs, error: failed };
      report.documents.push({ ...retirement, retraction: { retracted: [], left } });
      continue;
    }
    const done = await retractRuns(entries, retirement.runs, deps);
    entries = done.entries;
    failed = done.retraction.left?.error ?? null;
    report.documents.push({ ...retirement, retraction: done.retraction });
  }
  return report;
}
