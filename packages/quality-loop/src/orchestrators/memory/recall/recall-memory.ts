/**
 * One recall, wherever it is asked for: whether it can run at all, the probes
 * it searches under, one embedding batch, one search, the memory-recall run
 * over what came back, and the curated pack read back. The memory
 * orchestrator's recall step and a run that recalls for its own producer both
 * call this, so the two can never curate differently. What the lessons are
 * then used for — a goal section, a producer briefing — is the caller's.
 * Every way it can hand on nothing is a closed reason.
 */
import type { MemoryStoreAvailabilityDto, QualityRunDto } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { RunInput } from '../../../core/loop/run-pipeline';
import { outputsOf } from '../../../core/outputs';
import {
  MAX_CANDIDATES,
  MEMORY_RECALL_ID,
  renderGoal as renderQuery,
} from '../../../pipelines/memory-recall/input';
import { completed } from '../../common';
import type { MemoryPorts } from '../ports';
import { fuse } from './fusion';
import { buildQuery, probesOf, probeTexts, queryText, type FusedHit } from './query';
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
 * empty, with the reason, when it endorsed nothing.
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
      reason: 'not-accepted' | 'no-usable-memory' | null;
      counts: RecallCounts;
      runId: string;
      usable: UsableMemory[];
    };

/** Why a recall cannot run at all — no embeddings, no store, nothing stored, no pipeline — or null when it can. */
function readiness(ports: MemoryPorts, ask: RecallAsk): Recalled | null {
  const skipped = (
    reason: Extract<Recalled, { status: 'skipped' }>['reason'],
    note: string | null = null,
  ): Recalled => ({ status: 'skipped', reason, note });
  if (!ports.embeddings.enabled) return skipped('embeddings-disabled', ports.embedding.reason);
  if (!ask.store.ready) return skipped('store-unavailable', ask.store.note ?? ask.store.reason);
  if (ask.store.chunks === 0) return skipped('store-empty');
  if (ask.acceptAt === null) return skipped('pipeline-unavailable', MEMORY_RECALL_ID);
  return null;
}

export async function recallMemory(ports: MemoryPorts, ask: RecallAsk): Promise<Recalled> {
  const notReady = readiness(ports, ask);
  if (notReady !== null) return notReady;
  const { embeddings, store, probes } = ports;
  const acceptAt = ask.acceptAt ?? 0;

  const query = queryText(ask.goal);
  // The goal is always probe zero; derived conditions only widen the net.
  const texts = probeTexts(ask.goal, await probes.derive(query));
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

  const child = await ask.execute({ goal: renderQuery(buildQuery(query, texts, hits)) });
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
  const reason = !readout.admitted
    ? 'not-accepted'
    : readout.usable.length === 0
      ? 'no-usable-memory'
      : null;
  return { status: 'complete', reason, counts, runId: child.runId, usable: readout.usable };
}
