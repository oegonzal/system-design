import type { OrchestrationRunDto } from '@sysdesign/contracts';

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
 * which one it was.
 */

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
 * The step that kept a posting from storing anything, as one line — the first
 * that skipped, failed or completed with a reason, with its note — or null
 * when every step completed cleanly.
 */
export function unstoredBy(steps: ManifestEntry['steps'] | null): string | null {
  if (steps === null) return null;
  for (const id of DOCUMENT_MEMORY_STEPS) {
    const step = steps[id];
    if (step === null) return `${id} was not reported`;
    if (step.status === 'complete' && step.reason === null) continue;
    const reason = step.reason === null ? '' : `: ${step.reason}`;
    const note = step.note === null ? '' : ` — ${step.note}`;
    return `${id} ${step.status}${reason}${note}`;
  }
  return null;
}

/** Why a record stored nothing: the failure for `failed` and `refused`, the step that stopped an `unstored` one; null otherwise. */
export const whyNotStored = (record: {
  status: IngestStatus | null;
  error: string | null;
  steps: ManifestEntry['steps'] | null;
}): string | null => (record.status === 'unstored' ? unstoredBy(record.steps) : record.error);

/** The record of one posting, from the settled orchestration or from the failure that stood in for it. */
export function entryOf(input: {
  identity: ChunkIdentity;
  orchestrationRunId: string | null;
  orchestration: OrchestrationRunDto | null;
  status: IngestStatus;
  error: string | null;
  ingestedAt: string;
  loopUrl: string;
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
  };
}
