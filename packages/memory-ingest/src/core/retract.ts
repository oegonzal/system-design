import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import type { Clock, IngestLedger, IngestSink, ManifestEntry } from './ports';
import { documentKey, loopError, markRetracted } from './record';

/**
 * Retraction: what a digest run stored, taken out of the store by the run id
 * the manifest keeps, and every posting that names the run marked — when, and
 * how many points went. Two paths retract, by one rule — every digest run a
 * document's entries name, unless every entry naming it is marked already: an
 * ingest replacing a document once every chunk of its current plan is
 * covered, which keeps the runs that plan stands on, and `retract` retiring a
 * document whole. Both go through `retractRuns`, which saves the ledger after
 * each retraction — a mark is on disk the moment its points are gone, never
 * behind the next posting's minutes — and stops at the first the loop does
 * not carry out, saying which runs it left standing and why.
 */

/**
 * One digest run retracted, and how many points the store removed for it — 0
 * when it held none by then.
 */
interface RetractedRun {
  digestRunId: string;
  removed: number;
  /**
   * The loop the run's posting was recorded under, when that is not the one
   * it was retracted through; null when it is. Such a run is retracted and
   * marked all the same — two loops that share one store remove the same
   * points — but its count is only what the loop asked held, so the report
   * lists it apart.
   */
  recordedUnder: string | null;
}

/** What one batch of retractions did. */
export interface Retraction {
  /** The loop every retraction was asked of — the one the command is configured for. */
  through: string;
  /** Each run retracted, in order. */
  retracted: RetractedRun[];
  /** The runs left standing — the one whose retraction failed, then those after it, never asked — and why; null when none failed. */
  left: { digestRunIds: string[]; error: string } | null;
}

export interface RetractDeps {
  sink: Pick<IngestSink, 'retract'>;
  ledger: IngestLedger;
  clock: Clock;
  /** The loop the sink retracts through, as each posting records the loop it was posted to. */
  loopUrl: string;
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
async function retractRuns(
  entries: readonly ManifestEntry[],
  digestRunIds: readonly string[],
  deps: RetractDeps,
): Promise<{ entries: readonly ManifestEntry[]; retraction: Retraction }> {
  let marked = entries;
  const retracted: RetractedRun[] = [];
  const through = deps.loopUrl;
  for (const [index, digestRunId] of digestRunIds.entries()) {
    let removed: number;
    try {
      removed = await deps.sink.retract(digestRunId);
    } catch (error) {
      if (!RETRACT_FAILURES.some((kind) => error instanceof kind)) throw error;
      const left = { digestRunIds: digestRunIds.slice(index), error: loopError(error as Error) };
      return { entries: marked, retraction: { through, retracted, left } };
    }
    // One posting names a digest run, so its entries share the loop it was posted to.
    const recordedUnder =
      marked.find((entry) => entry.digestRunId === digestRunId && entry.loopUrl !== through)
        ?.loopUrl ?? null;
    marked = markRetracted(marked, digestRunId, deps.clock.now(), removed);
    await deps.ledger.save(marked);
    retracted.push({ digestRunId, removed, recordedUnder });
  }
  return { entries: marked, retraction: { through, retracted, left: null } };
}

/**
 * The entries of a document naming an orchestration whose report was never
 * read — a wait lost after the start — so no digest run is known to retract
 * for them: what each stored, if anything, is known once `status --refresh`
 * reads it back from the loop.
 */
export const unresolvedOf = (entries: readonly ManifestEntry[], document: string): number =>
  entries.filter(
    (entry) =>
      entry.document === document &&
      entry.orchestrationRunId !== null &&
      entry.digestRunId === null &&
      entry.steps.digest === null,
  ).length;

/**
 * What retiring a document asks of the store, read off its entries alone:
 * every digest run they name, those every entry of which is marked already
 * apart — the rule replacing a document goes by too.
 */
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
    unresolved: unresolvedOf(entries, document),
  };
}

/**
 * The digest runs replacing a document retracts — retirement's rule, every
 * run its entries name and not marked already, whatever the posting's status,
 * less the runs its current plan stands on. A posting that failed after its
 * digest stored, or one settled unstored that still names the run that judged
 * it, goes with the rest: retracting a run that stored nothing removes nothing.
 */
export const replacedRunsOf = (
  entries: readonly ManifestEntry[],
  document: string,
  standing: ReadonlySet<string>,
): string[] =>
  retirementOf(entries, document).runs.filter((digestRunId) => !standing.has(digestRunId));

/**
 * Make before break: a document whose current plan stands on these digest
 * runs, every chunk of it covered, has every other run of it retracted — what
 * an edit replaced, what a forced run posted again, what a change to the
 * goal's rules renamed.
 */
export const replaceDocument = (
  entries: readonly ManifestEntry[],
  document: string,
  standing: ReadonlySet<string>,
  deps: RetractDeps,
): Promise<{ entries: readonly ManifestEntry[]; retraction: Retraction }> =>
  retractRuns(entries, replacedRunsOf(entries, document, standing), deps);

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
  /** Entries no digest run is known to retract for (`unresolvedOf`). */
  unresolved: number;
}

export interface RetractReport {
  dryRun: boolean;
  documents: DocumentRetraction[];
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
      report.documents.push({
        ...retirement,
        retraction: { through: deps.loopUrl, retracted: [], left },
      });
      continue;
    }
    const done = await retractRuns(entries, retirement.runs, deps);
    entries = done.entries;
    failed = done.retraction.left?.error ?? null;
    report.documents.push({ ...retirement, retraction: done.retraction });
  }
  return report;
}
