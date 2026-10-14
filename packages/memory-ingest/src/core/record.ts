import { relative, resolve } from 'node:path';

import type { DocumentMemoryStepReason, OrchestrationRunDto } from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';

import {
  DOCUMENT_MEMORY_STEPS,
  type DocumentMemoryStep,
  type IngestStatus,
  type ManifestEntry,
  type ManifestStep,
  type PlannedChunk,
} from './ports';

/**
 * One posting as the manifest records it. The status is earned by what the
 * store step did, never read off the orchestration's own: the runner marks an
 * orchestration complete whenever no step failed, so a digest skipped for
 * want of embeddings, judged and not accepted, or finding nothing, and a
 * store that was unavailable, all settle `complete` with nothing stored. Here
 * each of those is `unstored`, and the steps — reason and note kept — say
 * which one it was; whether the posting still covers its chunk, because the
 * chunk holds no fact to store, is that reason's to say, as `HOLDS_NO_FACTS`
 * declares. A posting that stored what its digest endorsed and gave a reason
 * all the same left facts of its chunk out of the store, which the same table
 * says (`leftFactsOut`). What a posting stored stands until a retraction
 * marks it, and the mark is the ledger's own decision: rewriting a posting
 * from what the loop reports keeps it.
 */

/**
 * A document's key in the manifest: its path relative to the working
 * directory, however it was given — the one rule both the ingest that records
 * a document and the retraction that finds it go by, neither reading the file.
 */
export const documentKey = (path: string, cwd: string): string => relative(cwd, resolve(cwd, path));

/** What identifies a chunk in the manifest, apart from how its posting ended. */
export type ChunkIdentity = Pick<ManifestEntry, 'chunkHash' | 'document' | 'chunk' | 'kind'>;

export const identityOf = (planned: PlannedChunk, document: string): ChunkIdentity => ({
  chunkHash: planned.chunkHash,
  document,
  chunk: planned.chunk.chunk,
  kind: planned.chunk.kind,
});

/** The step whose completion means the chunk's facts are in the store. */
export const STORE_STEP: DocumentMemoryStep = 'store';

const summarizeStep = (
  orchestration: OrchestrationRunDto | null,
  id: DocumentMemoryStep,
): ManifestStep | null => {
  const step = orchestration?.steps[id];
  return step
    ? { status: step.status, reason: step.reason, note: step.note, counts: step.counts }
    : null;
};

/** A settled orchestration's status, as the manifest words it: by the store step, not the run. */
export const statusOf = (orchestration: OrchestrationRunDto): IngestStatus => {
  if (orchestration.status !== 'complete') return 'failed';
  return orchestration.steps[STORE_STEP]?.status === 'complete' ? 'complete' : 'unstored';
};

/**
 * The step that kept a posting from storing everything — the first that was
 * not reported, skipped, failed or completed with a reason — or null when
 * every step completed cleanly.
 */
function stoppingStep(
  steps: ManifestEntry['steps'],
): { id: DocumentMemoryStep; step: ManifestStep | null } | null {
  for (const id of DOCUMENT_MEMORY_STEPS) {
    const step = steps[id];
    if (step === null || step.status !== 'complete' || step.reason !== null) return { id, step };
  }
  return null;
}

/** The step that kept a posting from storing everything, as one line with its note; null when every step completed cleanly. */
export function unstoredBy(steps: ManifestEntry['steps'] | null): string | null {
  const stopping = steps === null ? null : stoppingStep(steps);
  if (stopping === null) return null;
  const { id, step } = stopping;
  if (step === null) return `${id} was not reported`;
  const reason = step.reason === null ? '' : `: ${step.reason}`;
  const note = step.note === null ? '' : ` — ${step.note}`;
  return `${id} ${step.status}${reason}${note}`;
}

/**
 * What a posting's steps say of its chunk, by the reason of the step that
 * kept it from storing everything: true where the reason is the loop's
 * verdict that the chunk holds no fact to store, so an `unstored` posting
 * covers its chunk as a stored one does — a re-run skips it, and it counts
 * toward its document's plan standing whole; false where the chunk's facts
 * are missing from the store — nothing stored, or the rest stored and these
 * left out — so it is posted again, and its document's earlier digests stand.
 * Total over the orchestrator's declared reasons, so a reason the loop adds
 * is classified here before this build compiles; a reason it does not declare
 * — the runner's own, or a newer loop's — reads as facts missing.
 */
export const HOLDS_NO_FACTS = {
  // Never digested: the loop had no embedding provider.
  'embeddings-disabled': false,
  // Digested, and the store was not there to take what the digest endorsed.
  'store-unavailable': false,
  // Digested, and embedding what it endorsed failed.
  'embedding-failed': false,
  // Judged below the bar with nothing drawn on: a digest of the same text may yet be.
  'not-accepted': false,
  // Never judged: no rubric was derived.
  'no-rubric': false,
  // Never judged: nothing was produced.
  'no-artifact': false,
  // Judged, accepted, and it endorsed nothing: the chunk holds no fact to store.
  'no-memories': true,
  // Memories bound to a unit of work, in a document that names none: withheld,
  // whatever else of the chunk was stored. A file names no unit, so a document
  // that declares no scope may meet this; one declaring `subject` never does.
  'unit-unnamed': false,
} as const satisfies Record<DocumentMemoryStepReason, boolean>;

const isDeclaredReason = (reason: string): reason is DocumentMemoryStepReason =>
  Object.hasOwn(HOLDS_NO_FACTS, reason);

/** The reason the step that kept a posting from storing everything gave; null when none did. */
const stoppingReason = (entry: ManifestEntry): string | null =>
  stoppingStep(entry.steps)?.step?.reason ?? null;

/** Whether a reason says the chunk holds no fact to store, as the table declares; any other reads as facts missing. */
const holdsNone = (reason: string): boolean => isDeclaredReason(reason) && HOLDS_NO_FACTS[reason];

/** Whether a posting settled with nothing stored for a reason that says its chunk holds no fact to store. */
export function holdsNoFacts(entry: ManifestEntry): boolean {
  if (entry.status !== 'unstored') return false;
  const reason = stoppingReason(entry);
  return reason !== null && holdsNone(reason);
}

/**
 * Whether a posting stored what its digest endorsed and left facts of its
 * chunk out of the store all the same: a step completed with a reason the
 * table reads as facts missing — memories bound to a unit of work, in a
 * document that names none (`unit-unnamed`). Such a posting does not cover
 * its chunk, so its document's earlier digests stand; it reads as `unstored`
 * in the report, its steps saying why.
 */
export function leftFactsOut(entry: ManifestEntry): boolean {
  if (entry.status !== 'complete') return false;
  const reason = stoppingReason(entry);
  return reason !== null && !holdsNone(reason);
}

/** A loop error as a record words it: a refusal by its status and the loop's own message, anything else by its message. */
export const loopError = (error: Error): string =>
  error instanceof LoopRefused ? `${error.status}: ${error.message}` : error.message;

/**
 * Why a record did not store everything: the failure for `failed` and
 * `refused`, else the step that kept it from storing everything — an
 * `unstored` posting's, or a stored one's that left facts out; null when it
 * stored everything, or was never posted.
 */
export const whyNotStored = (record: {
  status: IngestStatus | null;
  error: string | null;
  steps: ManifestEntry['steps'] | null;
}): string | null => {
  if (record.status === null) return null;
  if (record.status === 'failed' || record.status === 'refused') return record.error;
  return unstoredBy(record.steps);
};

/**
 * The record of one posting, from the settled orchestration or from the
 * failure that stood in for it. The retraction mark is an input, not a
 * reading: a fresh posting stands (null), and a posting rewritten from what the
 * loop reports keeps the mark the ledger gave it.
 */
export function entryOf(input: {
  identity: ChunkIdentity;
  orchestrationRunId: string | null;
  orchestration: OrchestrationRunDto | null;
  status: IngestStatus;
  error: string | null;
  ingestedAt: string;
  loopUrl: string;
  retractedAt: string | null;
  retractedPoints: number | null;
}): ManifestEntry {
  const digest = input.orchestration?.steps['digest'];
  return {
    ...input.identity,
    orchestrationRunId: input.orchestrationRunId,
    digestRunId: digest?.runIds[digest.runIds.length - 1] ?? null,
    status: input.status,
    steps: Object.fromEntries(
      DOCUMENT_MEMORY_STEPS.map((id) => [id, summarizeStep(input.orchestration, id)]),
    ) as ManifestEntry['steps'],
    error: input.error,
    ingestedAt: input.ingestedAt,
    loopUrl: input.loopUrl,
    retractedAt: input.retractedAt,
    retractedPoints: input.retractedPoints,
  };
}

/**
 * Whether a posting covers its chunk: no retraction has marked it, and it
 * either stored the chunk's facts — leaving none out (`leftFactsOut`) — or
 * settled with nothing stored because the chunk holds none (`HOLDS_NO_FACTS`).
 * A covered chunk is skipped on a re-run unless forced, and a document whose
 * every chunk is covered stands whole.
 */
export const covers = (entry: ManifestEntry): boolean =>
  entry.retractedAt === null &&
  ((entry.status === 'complete' && !leftFactsOut(entry)) || holdsNoFacts(entry));

/**
 * The entries with every posting that names the digest run and still stands
 * marked retracted — when, and how many points went. Each marked posting is a
 * new object and the array a new array, so nothing holding the entries it was
 * handed sees a mark it has not been given; a posting marked before keeps its
 * first mark.
 */
export const markRetracted = (
  entries: readonly ManifestEntry[],
  digestRunId: string,
  at: string,
  removed: number,
): ManifestEntry[] =>
  entries.map((entry) =>
    entry.digestRunId === digestRunId && entry.retractedAt === null
      ? { ...entry, retractedAt: at, retractedPoints: removed }
      : entry,
  );
