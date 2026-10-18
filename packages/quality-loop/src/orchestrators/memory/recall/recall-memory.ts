/**
 * One recall, wherever it is asked for: whether it can run at all, the probes
 * it searches under, one embedding batch, one search, the memory-recall run
 * over what came back, and the curated pack read back. The memory
 * orchestrator's recall step and a run that recalls for its own producer both
 * call this, so the two can never curate differently. What the lessons are
 * then used for — a goal section, a producer briefing — is the caller's.
 * Every way it can hand on nothing is a closed reason.
 */
import {
  describeIssue,
  type MemoryStoreAvailabilityDto,
  type QualityRunDto,
  type RecallFocusDto,
  type RecallNoveltyDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { RunInput } from '../../../core/loop/run-pipeline';
import { outputsOf } from '../../../core/outputs';
import {
  MAX_CANDIDATES,
  MEMORY_RECALL_ID,
  renderGoal as renderQuery,
} from '../../../pipelines/memory-recall/input';
import { completed, storeReadiness, UNADMITTED_REASON, type UnadmittedReason } from '../../common';
import type { MemoryPorts } from '../ports';
import { fuse } from './fusion';
import { focusLines } from './focus';
import { knownLines, type RecallKnown } from './known';
import { noveltyOf, POOL_FACTOR, screen } from './novelty';
import { buildQuery, probeSet, probesOf, queryText, type FusedHit, type OfferedHit } from './query';
import { readPack, type UsableMemory } from './read-pack';

export interface RecallAsk {
  /** The goal to recall for, taken bare: memory a previous run appended is not part of it. */
  goal: string;
  /** What the store reported — when the orchestration opened, or just now. */
  store: MemoryStoreAvailabilityDto;
  /** memory-recall's own accept bar; null when it is not registered here. */
  acceptAt: number | null;
  /** Run memory-recall over the composed query, to completion. */
  execute(input: RunInput): Promise<QualityRunDto>;
  /**
   * What is wrong with the answer the goal is about, when it was judged
   * before (`focusOf`): searched beside the goal and shown to the curator.
   * Absent for a recall over the goal alone — the memory orchestrator's.
   */
  focus?: RecallFocusDto | null;
  /**
   * What the producer the recall is for already holds, when it revises a
   * judged answer (`knownOf`): the search reaches wider, what came back is
   * screened against it after fusion, and the curator is told it. Absent for
   * a recall over the goal alone — the memory orchestrator's, which composes
   * exactly the query it did before there was a screen.
   */
  known?: RecallKnown | null;
}

/** How many texts were searched, how many came back, and what the curator made of them. */
export interface RecallCounts {
  probes: number;
  /** What the curator was offered: the hits, as many as the goal budget held. */
  candidates: number;
  /** The hits the goal budget left out of what the curator was offered; 0 when every one fit. */
  deferred: number;
  kept: number;
  usable: number;
}

/**
 * What came of it. `skipped`: it could not start — or every lesson it found
 * the producer already held (`nothing-new`), so no recall run opened.
 * `failed`: it started and broke, `runId` naming the recall run when the
 * break was that run. `complete`: the recall run finished, and `usable` is
 * what it endorsed — empty, with the reason, when it endorsed nothing: judged
 * and short of the bar, or never judged at all, which the reason keeps apart.
 * A screened recall carries what its screen did, however it ended after it.
 */
export type Recalled = (
  | {
      status: 'skipped';
      reason:
        | 'embeddings-disabled'
        | 'store-unavailable'
        | 'store-empty'
        | 'pipeline-unavailable'
        | 'nothing-new';
      note: string | null;
    }
  | {
      status: 'failed';
      reason: 'embedding-failed' | 'store-unavailable' | 'query-refused' | 'run-failed';
      note: string | null;
      /** Only what was counted before it broke: the probes, when the embedding did. */
      counts?: Pick<RecallCounts, 'probes'>;
      runId: string | null;
    }
  | {
      status: 'complete';
      reason: UnadmittedReason | 'no-usable-memory' | null;
      counts: RecallCounts;
      runId: string;
      usable: UsableMemory[];
    }
) & { novelty?: RecallNoveltyDto };

/** Why a recall cannot run at all — the store cannot be searched, or the curating pipeline is not registered — or null when it can. */
function readiness(ports: MemoryPorts, ask: RecallAsk): Recalled | null {
  const notReady = storeReadiness(ports, ask.store);
  if (notReady !== null) return { status: 'skipped', ...notReady };
  if (ask.acceptAt === null) {
    return { status: 'skipped', reason: 'pipeline-unavailable', note: MEMORY_RECALL_ID };
  }
  return null;
}

export async function recallMemory(ports: MemoryPorts, ask: RecallAsk): Promise<Recalled> {
  const notReady = readiness(ports, ask);
  if (notReady !== null) return notReady;
  const { embeddings, store, probes } = ports;
  const acceptAt = ask.acceptAt ?? 0;

  const query = queryText(ask.goal);
  // The goal is always probe zero; the focus and the derived conditions only
  // widen the net. The deriver is shown the focus too, so the conditions it
  // writes reach for the lessons about what is wrong now, not the goal alone.
  const focus = focusLines(ask.focus ?? null);
  const searched = probeSet(ask.goal, await probes.derive(query, focus), focus);
  const texts = searched.texts;
  const embedded = await embeddings.embed(texts);
  if (embedded === null) {
    return {
      status: 'failed',
      reason: 'embedding-failed',
      note: null,
      counts: { probes: texts.length },
      runId: null,
    };
  }
  // A screened recall reaches wider, so what it sets aside as already held
  // leaves room for what is not; one over the goal alone searches as it did.
  const known = ask.known ?? null;
  const pool = known === null ? MAX_CANDIDATES : MAX_CANDIDATES * POOL_FACTOR;
  let fused: FusedHit[];
  try {
    fused = fuse(await store.searchMany(probesOf(embedded.vectors, pool)), pool);
  } catch (error) {
    return {
      status: 'failed',
      reason: 'store-unavailable',
      note: describeError(error).message,
      runId: null,
    };
  }
  if (fused.length === 0) return { status: 'skipped', reason: 'store-empty', note: null };

  const screened = known === null ? null : screen(fused, known, MAX_CANDIDATES);
  const hits: OfferedHit[] = screened?.offered ?? fused;
  // Spread onto every outcome below, so a screened recall says what its screen did however it ends.
  const novelty =
    known === null || screened === null
      ? {}
      : { novelty: noveltyOf(known, fused.length, screened) };
  if (hits.length === 0)
    return { status: 'skipped', reason: 'nothing-new', note: null, ...novelty };

  const built = buildQuery(query, searched, hits, known === null ? [] : knownLines(known));
  if (built.query === null) {
    return {
      status: 'failed',
      reason: 'query-refused',
      note: built.issues.map(describeIssue).join('; '),
      counts: { probes: texts.length },
      runId: null,
      ...novelty,
    };
  }
  const child = await ask.execute({ goal: renderQuery(built.query) });
  if (!completed(child)) {
    return {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message ?? null,
      runId: child.runId,
      ...novelty,
    };
  }
  const readout = readPack(outputsOf(child.trace), hits, acceptAt);
  const counts: RecallCounts = {
    probes: texts.length,
    candidates: built.query.candidates.length,
    deferred: built.deferred,
    kept: readout.kept,
    usable: readout.usable.length,
  };
  const reason =
    readout.admission !== 'admitted'
      ? UNADMITTED_REASON[readout.admission]
      : readout.usable.length === 0
        ? 'no-usable-memory'
        : null;
  return {
    status: 'complete',
    reason,
    counts,
    runId: child.runId,
    usable: readout.usable,
    ...novelty,
  };
}
