/**
 * The memory orchestrator's four steps, as adapters over its ports. Each one
 * decides its own closed reason and returns what the next step needs; the
 * runner owns the ledger, the cascade and the child ids. Recall never blocks
 * the target; the target's failure is the one that ends the run.
 */
import type { MemoryContextDto, MemoryStepReason, QualityRunDto } from '@sysdesign/contracts';

import { outputsOf, teachesNothingNew } from '../../core/outputs';
import { fromRun } from '../../pipelines/experience-digest/from-run';
import {
  EXPERIENCE_DIGEST_ID,
  renderGoal as renderRecord,
} from '../../pipelines/experience-digest/input';
import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import {
  completed,
  requestInput,
  runFailed,
  runTarget,
  skipped,
  UNADMITTED_REASON,
} from '../common';
import type { StepContext, StepResult } from '../runner/definition';
import { memoriesToStore, type Digested } from './digest/read-digest';
import type { MemoryPorts } from './ports';
import { bareGoal } from '../common';
import { withMemory } from './recall/inject';
import { recallMemory } from './recall/recall-memory';
import { indexMemories } from './store/index-memories';
import { DEFAULT_CHUNK_KIND } from './store/chunks';

/** What each step hands on. `store` yields nothing: it is the end of the line. */
export interface MemoryOutputs {
  recall: { goal: string };
  target: QualityRunDto;
  digest: Digested;
  store: undefined;
}

type Ctx = StepContext<MemoryOutputs, MemoryPorts>;

/** A skip for one of the memory orchestrator's declared reasons, or the runner's two that a step may give itself. */
const skip = (
  reason: MemoryStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => skipped(reason, note);

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/**
 * Recall memory for the goal — the one recall a run's own producer briefing
 * shares — and yield the goal the target should run with, memory appended
 * within the goal budget, or nothing.
 */
export async function recall(ctx: Ctx): Promise<StepResult<{ goal: string }>> {
  const goal = ctx.request.goal;
  const recalled = await recallMemory(ctx.ports, {
    goal,
    store: contextOf(ctx).store,
    acceptAt: ctx.acceptAtOf(MEMORY_RECALL_ID),
    execute: (input) => ctx.execute(input),
  });
  if (recalled.status !== 'complete') {
    const { status, reason, note } = recalled;
    const counts = recalled.status === 'failed' ? recalled.counts : undefined;
    return { status, reason, note, ...(counts === undefined ? {} : { counts }) };
  }
  const counts = { ...recalled.counts, injected: 0 };
  if (recalled.reason !== null) return { status: 'complete', reason: recalled.reason, counts };
  const composed = withMemory(goal, recalled.usable);
  if (composed === null) return { status: 'complete', reason: 'goal-at-budget', counts };
  return {
    status: 'complete',
    counts: { ...counts, injected: composed.injected },
    output: { goal: composed.goal },
  };
}

/** Run the target pipeline with whatever recall handed on; its failure is the run's. */
export const target = (ctx: Ctx): Promise<StepResult<QualityRunDto>> =>
  runTarget(ctx, requestInput(ctx.request, ctx.outputs.recall?.goal ?? ctx.request.goal));

/**
 * Digest the finished target; yields what the digest endorsed, or nothing
 * with the reason — and a digest that was never judged (no rubric derived,
 * nothing produced) says that, never `not-accepted`. A target whose only
 * judged evidence it adopted is not digested at all: that ledger is a copy of
 * an earlier run's, whose own digest already read it, so the step skips
 * `nothing-new` naming the run it was copied from.
 */
export async function digest(ctx: Ctx): Promise<StepResult<Digested>> {
  const source = ctx.outputs.target;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (!ctx.ports.embeddings.enabled) {
    return skip('embeddings-disabled', contextOf(ctx).embedding.reason);
  }
  const acceptAt = ctx.acceptAtOf(EXPERIENCE_DIGEST_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', EXPERIENCE_DIGEST_ID);
  // The digest judges the bare prompt: remembered evidence is never re-digested.
  const trace = source.trace;
  const record =
    trace === null
      ? null
      : fromRun({
          ...source,
          trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
        });
  if (trace === null || record === null) return skip('nothing-to-digest');
  if (teachesNothingNew(trace)) {
    return skip('nothing-new', source.request.adoptedFrom?.runId ?? null);
  }

  const child = await ctx.execute({ goal: renderRecord(record) });
  if (!completed(child)) return runFailed(child);
  const { admission, proposed, memories } = memoriesToStore(outputsOf(child.trace), acceptAt);
  const counts = { memories: proposed, kept: memories.length };
  if (admission !== 'admitted') {
    return { status: 'complete', reason: UNADMITTED_REASON[admission], counts };
  }
  if (memories.length === 0) return { status: 'complete', reason: 'no-memories', counts };
  return { status: 'complete', counts, output: { digestRunId: child.runId, memories } };
}

/** Store what the digest endorsed as the target run's memory. */
export async function store(ctx: Ctx): Promise<StepResult<undefined>> {
  const source = ctx.outputs.target;
  const digested = ctx.outputs.digest;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (digested === undefined) return skip('upstream-skipped', 'digest');
  const context = contextOf(ctx);
  const model = ctx.ports.embeddings.model;
  if (!context.store.ready || source.trace === null || model === null) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  // This writer owns a source run's lessons; the knowledge orchestrator keeps
  // its own kinds under the same run, and a document digest writes under its
  // own digest run, never this one.
  return indexMemories(ctx.ports, source, digested, model, [DEFAULT_CHUNK_KIND]);
}
