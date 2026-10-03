/**
 * One recall, wherever it is asked for: whether it can run at all, the probes
 * it searches under, one embedding batch, one search, the memory-recall run
 * over what came back, and the curated pack read back. The memory
 * orchestrator's recall step and a run that recalls for its own producer both
 * call this, so the two can never curate differently. What the lessons are
 * then used for — a goal section, a producer briefing — is the caller's.
 * Every way it can hand on nothing is a closed reason.
 */
import type {
  MemoryStoreAvailabilityDto,
  QualityRunDto,
  RecallFocusDto,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { RunInput } from '../../../core/loop/run-pipeline';
import { outputsOf } from '../../../core/outputs';
import {
  MAX_CANDIDATES,
  MEMORY_RECALL_ID,
  renderGoal as renderQuery,
} from '../../../pipelines/memory-recall/input';
import { completed, storeReadiness } from '../../common';
import type { MemoryPorts } from '../ports';
import { fuse } from './fusion';
import { focusLines } from './focus';
import { buildQuery, probeSet, probesOf, queryText, type FusedHit } from './query';
import { readPack, type UsableMemory } from './read-pack';
import { UNADMITTED_REASON, type UnadmittedReason } from '../unadmitted';

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
}

/** How many texts were searched, how many came back, and what the curator made of them. */
export interface RecallCounts {
  probes: number;
  candidates: number;
  kept: number;
  usable: number;
}

/**
 * What came of it. `skipped`: it could not start. `failed`: it started and
 * broke, `runId` naming the recall run when the break was that run.
 * `complete`: the recall run finished, and `usable` is what it endorsed —
 * empty, with the reason, when it endorsed nothing: judged and short of the
 * bar, or never judged at all, which the reason keeps apart.
 */
export type Recalled =
  | {
      status: 'skipped';
      reason: 'embeddings-disabled' | 'store-unavailable' | 'store-empty' | 'pipeline-unavailable';
      note: string | null;
    }
  | {
      status: 'failed';
      reason: 'embedding-failed' | 'store-unavailable' | 'run-failed';
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
    };

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
  let hits: FusedHit[];
  try {
    hits = fuse(await store.searchMany(probesOf(embedded.vectors, MAX_CANDIDATES)), MAX_CANDIDATES);
  } catch (error) {
    return {
      status: 'failed',
      reason: 'store-unavailable',
      note: describeError(error).message,
      runId: null,
    };
  }
  if (hits.length === 0) return { status: 'skipped', reason: 'store-empty', note: null };

  const child = await ask.execute({ goal: renderQuery(buildQuery(query, searched, hits)) });
  if (!completed(child)) {
    return {
      status: 'failed',
      reason: 'run-failed',
      note: child.error?.message ?? null,
      runId: child.runId,
    };
  }
  const readout = readPack(outputsOf(child.trace), hits, acceptAt);
  const counts: RecallCounts = {
    probes: texts.length,
    candidates: hits.length,
    kept: readout.kept,
    usable: readout.usable.length,
  };
  const reason =
    readout.admission !== 'admitted'
      ? UNADMITTED_REASON[readout.admission]
      : readout.usable.length === 0
        ? 'no-usable-memory'
        : null;
  return { status: 'complete', reason, counts, runId: child.runId, usable: readout.usable };
}
