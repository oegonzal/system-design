import {
  SinkFault,
  type Clock,
  type IngestLedger,
  type IngestSink,
  type ManifestEntry,
} from './ports';
import { documentKey, markRetracted, throughStore, type StoreIdentity } from './record';

/**
 * Retraction: what a digest run stored, taken out of the store by the posting
 * that names it in the manifest, and every posting that names the run marked
 * — when, and how many memories went. Two paths retract, by one rule — every
 * digest run a document's postings through the configured store name, unless
 * every posting naming it is marked already: an ingest replacing a document
 * once every chunk of its current plan is covered, which keeps the runs that
 * plan stands on, and `retract` retiring a document whole. Both go through
 * `retractRuns`, which saves the ledger after each retraction — a mark is on
 * disk the moment its memories are gone, never behind the next posting's
 * minutes — and stops at the first the service does not carry out, saying
 * which runs it left standing and why. A record another standing posting
 * through the store lists too is kept: a fact two postings answered is one
 * record, and the posting that still covers it stands on it. A posting made
 * through another store is another store's copy, and neither path touches it.
 */

/**
 * One digest run retracted, and how many memories the store removed for it —
 * 0 when it held none by then.
 */
interface RetractedRun {
  digestRunId: string;
  removed: number;
  /** Records the posting listed that another standing posting lists too, left current. */
  kept: number;
  /**
   * The service the run's posting was recorded under, when that is not the
   * one it was retracted through; null when it is. Such a run is retracted
   * and marked all the same — two services of one kind may share one store —
   * but its count is only what the service asked held, so the report lists it
   * apart.
   */
  recordedUnder: string | null;
}

/** What one batch of retractions did. */
export interface Retraction {
  /** The service every retraction was asked of — the one the command is configured for. */
  through: string;
  /** Each run retracted, in order. */
  retracted: RetractedRun[];
  /** The runs left standing — the one whose retraction failed, then those after it, never asked — and why; null when none failed. */
  left: { digestRunIds: string[]; error: string } | null;
}

export interface RetractDeps {
  sink: Pick<IngestSink, 'kind' | 'host' | 'spaceId' | 'scope' | 'retract'>;
  ledger: IngestLedger;
  clock: Clock;
}

/** How many runs a batch left standing; none when it did not run. */
export const leftStanding = (retraction: Retraction | null): number =>
  retraction?.left?.digestRunIds.length ?? 0;

/** The standing posting that names each digest run — the one the sink is asked to take out of its store. */
const postingNaming = (entries: readonly ManifestEntry[], digestRunId: string): ManifestEntry => {
  const posting = entries.find(
    (entry) => entry.digestRunId === digestRunId && entry.retractedAt === null,
  );
  if (posting === undefined) throw new Error(`no standing posting names digest run ${digestRunId}`);
  return posting;
};

/**
 * The records the standing postings through the store list, less those of
 * the run being retracted: what a retraction of that run leaves current, since
 * a posting that still stands on a record is the one that covers it.
 */
const keptByOthers = (
  entries: readonly ManifestEntry[],
  store: StoreIdentity,
  digestRunId: string,
): ReadonlySet<string> =>
  new Set(
    throughStore(entries, store)
      .filter((entry) => entry.retractedAt === null && entry.digestRunId !== digestRunId)
      .flatMap((entry) => entry.recordIds),
  );

/**
 * Retract each run in turn, marking every posting that names it and saving
 * the ledger before the next. The first retraction the service does not carry
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
  const through = deps.sink.host;
  for (const [index, digestRunId] of digestRunIds.entries()) {
    const posting = postingNaming(marked, digestRunId);
    const keep = keptByOthers(marked, deps.sink, digestRunId);
    let removed: number;
    try {
      removed = await deps.sink.retract(posting, keep);
    } catch (error) {
      if (!(error instanceof SinkFault)) throw error;
      const left = { digestRunIds: digestRunIds.slice(index), error: error.message };
      return { entries: marked, retraction: { through, retracted, left } };
    }
    const recordedUnder = posting.host === through ? null : posting.host;
    const kept = posting.recordIds.filter((recordId) => keep.has(recordId)).length;
    marked = markRetracted(marked, digestRunId, deps.clock.now(), removed);
    await deps.ledger.save(marked);
    retracted.push({ digestRunId, removed, kept, recordedUnder });
  }
  return { entries: marked, retraction: { through, retracted, left: null } };
}

/**
 * The entries of a document through one store naming a run whose report was
 * never read — a wait lost after the start — so no digest run is known to
 * retract for them: what each stored, if anything, is known once
 * `status --refresh` reads it back from the service.
 */
export const unresolvedOf = (
  entries: readonly ManifestEntry[],
  store: StoreIdentity,
  document: string,
): number =>
  throughStore(entries, store).filter(
    (entry) =>
      entry.document === document &&
      entry.orchestrationRunId !== null &&
      entry.digestRunId === null &&
      entry.steps.digest === null,
  ).length;

/**
 * What retiring a document asks of one store, read off its entries alone:
 * every digest run its postings through the store name, those every entry of
 * which is marked already apart — the rule replacing a document goes by too.
 */
function retirementOf(
  entries: readonly ManifestEntry[],
  store: StoreIdentity,
  document: string,
): Omit<DocumentRetraction, 'retraction'> {
  const own = throughStore(entries, store).filter((entry) => entry.document === document);
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
    unresolved: unresolvedOf(entries, store, document),
  };
}

/**
 * The digest runs replacing a document retracts — retirement's rule, every
 * run its postings through the store name and not marked already, whatever
 * the posting's status, less the runs its current plan stands on. A posting
 * that failed after its digest stored, or one settled unstored that still
 * names the run that judged it, goes with the rest: retracting a run that
 * stored nothing removes nothing.
 */
export const replacedRunsOf = (
  entries: readonly ManifestEntry[],
  store: StoreIdentity,
  document: string,
  standing: ReadonlySet<string>,
): string[] =>
  retirementOf(entries, store, document).runs.filter((digestRunId) => !standing.has(digestRunId));

/**
 * Make before break: a document whose current plan stands on these digest
 * runs, every chunk of it covered, has every other run of it through the store
 * retracted — what an edit replaced, what a forced run posted again, what a
 * change to the goal's rules renamed.
 */
export const replaceDocument = (
  entries: readonly ManifestEntry[],
  document: string,
  standing: ReadonlySet<string>,
  deps: RetractDeps,
): Promise<{ entries: readonly ManifestEntry[]; retraction: Retraction }> =>
  retractRuns(entries, replacedRunsOf(entries, deps.sink, document, standing), deps);

/** A store as a refusal names it: the sink, and for a space the space and the scope written under. */
const describeStore = (store: StoreIdentity): string =>
  store.kind === 'space'
    ? `space sink (space ${store.spaceId}, scope ${Object.entries(store.scope ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(',')})`
    : `${store.kind} sink`;

/** Paths the manifest holds no entry for through the configured store, refused by name before anything is retracted. */
export class NotInManifest extends Error {
  override readonly name = 'NotInManifest';
  constructor(
    readonly documents: readonly string[],
    manifest: string,
    store: StoreIdentity,
  ) {
    super(
      `${manifest} has no entry for ${documents.join(', ')} through the ${describeStore(store)}: a document is found by its path from the working directory it was ingested in, in the manifest it was ingested under, among the postings made through the configured store — the sink, and for a space the space and the tenant written under`,
    );
  }
}

/** One document retired: the digest runs its entries name, and what retracting them did. */
export interface DocumentRetraction {
  document: string;
  /** Entries the manifest holds for the document through the store, of every status. */
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
 * Retire documents from one store: every digest run any entry of a document
 * through the store names, whatever its status — retracting a run that stored
 * nothing removes nothing — is retracted and marked. A document is found by
 * the key the ingest recorded it under, from its path alone, and is never
 * read, so a document deleted since is retired all the same; a path the
 * manifest holds no entry for through the store refuses the command before
 * anything is retracted. The first retraction the service does not carry out
 * leaves the rest standing — that document's, and every one after.
 */
export async function retractDocuments(
  paths: readonly string[],
  options: { dryRun: boolean; cwd: string },
  deps: RetractDeps,
): Promise<RetractReport> {
  const store: StoreIdentity = deps.sink;
  let entries = await deps.ledger.load();
  const documents = [...new Set(paths.map((path) => documentKey(path, options.cwd)))];
  const own = throughStore(entries, store);
  const missing = documents.filter((document) => !own.some((entry) => entry.document === document));
  if (missing.length > 0) throw new NotInManifest(missing, deps.ledger.path, store);

  const report: RetractReport = { dryRun: options.dryRun, documents: [] };
  let failed: string | null = null;
  for (const document of documents) {
    const retirement = retirementOf(entries, store, document);
    if (options.dryRun) {
      report.documents.push({ ...retirement, retraction: null });
      continue;
    }
    if (failed !== null) {
      const left =
        retirement.runs.length === 0 ? null : { digestRunIds: retirement.runs, error: failed };
      report.documents.push({
        ...retirement,
        retraction: { through: deps.sink.host, retracted: [], left },
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
