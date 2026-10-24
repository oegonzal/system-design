/**
 * The knowledge orchestrator's four steps, as adapters over its ports. Each one
 * decides its own closed reason and returns what the next step needs; the runner
 * owns the ledger, the cascade and the child ids.
 *
 * `known` never blocks `digest`: a store that is empty, unreachable or switched
 * off means the digest writes what the run taught with nothing to compare it
 * against, which is exactly what every digest did before there was a store. The
 * target's failure is the one that ends the run.
 */
import type {
  KnowledgeDigestReportDto,
  KnowledgeKnownReportDto,
  KnowledgeStepReason,
  MemoryContextDto,
  PipelineSummary,
  QualityRunDto,
  RunTrace,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { outputsOf } from '../../core/outputs';
import {
  KNOWLEDGE_DIGEST_ID,
  alias,
  renderGoal as renderKnowledge,
} from '../../pipelines/knowledge-digest/input';
import { fromRun, type RecalledItem } from '../../pipelines/knowledge-digest/from-run';
import {
  completed,
  requestInput,
  runFailed,
  runTarget,
  skipped,
  storeReadiness,
  UNADMITTED_REASON,
} from '../common';
import { bareGoal } from '../common';
import { originOf } from '../memory/store/index-memories';
import type { MemoryHit } from '../memory/ports';
import type { StepContext, StepResult } from '../runner/definition';
import {
  readKnowledgeDigest,
  type KnownRef,
  type KnowledgeToStore,
} from './digest/read-knowledge-digest';
import { fuseKnown, knownFilter, knownProbes, probesOf } from './known/probes';
import type { KnowledgePorts } from './ports';
import { dimensionMapOf } from './store/chunks';
import { indexKnowledge } from './store/index-knowledge';

/** What each step hands on. `store` yields nothing: it is the end of the line. */
export interface KnowledgeOutputs {
  target: QualityRunDto;
  known: { known: MemoryHit[] };
  digest: {
    digestRunId: string;
    items: KnowledgeToStore[];
    dimensions: ReturnType<typeof dimensionMapOf>;
    unresolved: number;
  };
  store: undefined;
}

type Ctx = StepContext<KnowledgeOutputs, KnowledgePorts>;

/** A skip for one of this orchestrator's declared reasons, or the runner's two a step may give itself. */
const skip = (
  reason: KnowledgeStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => skipped(reason, note);

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/** The run to learn from, on the request's own terms; its failure is the orchestration's. */
export const target = (ctx: Ctx): Promise<StepResult<QualityRunDto>> =>
  runTarget(ctx, requestInput(ctx.request));

/** The settled trace of the run the orchestration is about, or null when it has none. */
const traceOf = (run: QualityRunDto | undefined): RunTrace | null => {
  const trace = run?.trace ?? null;
  return trace === null || trace.stopReason === null || trace.iterations.length === 0
    ? null
    : trace;
};

/**
 * Ask the store what it already knows about this run's own evidence, with no
 * model call: the confirmed findings and the judged criteria are already the two
 * registers the store indexes.
 */
export async function known(ctx: Ctx): Promise<StepResult<KnowledgeOutputs['known']>> {
  const source = ctx.outputs.target;
  if (source === undefined) return skip('upstream-skipped', 'target');
  const trace = traceOf(source);
  if (trace === null) return skip('nothing-to-digest');
  const notReady = storeReadiness(ctx.ports, contextOf(ctx).store);
  if (notReady !== null) return skip(notReady.reason, notReady.note);

  const lines = knownProbes(trace);
  if (lines.length === 0) return skip('no-probes');
  const embedded = await ctx.ports.embeddings.embed(lines);
  if (embedded === null) {
    return {
      status: 'failed',
      reason: 'embedding-failed',
      note: null,
      counts: { probes: lines.length },
    };
  }
  let hits: MemoryHit[];
  try {
    hits = fuseKnown(
      await ctx.ports.store.searchMany(probesOf(embedded.vectors, knownFilter(source.runId))),
    );
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }
  const report: KnowledgeKnownReportDto = {
    known: hits.map((hit, position) => ({
      alias: alias(position),
      runId: hit.source.runId,
      ref: hit.source.ref,
      kind: hit.source.kind,
    })),
  };
  return {
    status: 'complete',
    counts: { probes: lines.length, known: hits.length },
    report: { ...report },
    output: { known: hits },
  };
}

/** A recalled hit as the record's codec takes it. */
const recalled = (hit: MemoryHit): RecalledItem => ({
  kind: hit.source.kind,
  runId: hit.source.runId,
  ref: hit.source.ref,
  pipeline: hit.source.pipeline,
  when: hit.source.when,
  text: hit.text,
});

/** The source pipeline's policy, which is where an item's dimension comes from. */
const policyOf = (
  registry: readonly PipelineSummary[],
  trace: RunTrace,
): PipelineSummary | undefined => registry.find((summary) => summary.id === trace.pipeline.id);

/**
 * Digest the finished run against what is known; yields what the digest endorsed,
 * or nothing with the reason — and a digest that was never judged says that,
 * never `not-accepted`.
 */
export async function digest(ctx: Ctx): Promise<StepResult<KnowledgeOutputs['digest']>> {
  const source = ctx.outputs.target;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (!ctx.ports.embeddings.enabled) {
    return skip('embeddings-disabled', contextOf(ctx).embedding.reason);
  }
  const acceptAt = ctx.acceptAtOf(KNOWLEDGE_DIGEST_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', KNOWLEDGE_DIGEST_ID);
  const trace = traceOf(source);
  if (trace === null) return skip('nothing-to-digest');
  const summary = policyOf(ctx.registry, trace);
  if (summary === undefined) return skip('source-pipeline-unknown', trace.pipeline.id);

  // The digest judges the bare prompt: remembered evidence is never re-digested.
  const bare: QualityRunDto = {
    ...source,
    trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
  };
  const hits = ctx.outputs.known?.known ?? [];
  const record = fromRun(
    bare,
    {
      pipeline: summary.id,
      version: summary.version,
      dimensions: Object.keys(summary.policy.dimensionWeights),
      map: dimensionMapOf(summary.policy),
    },
    { known: hits.map(recalled) },
  );
  if (record === null) return skip('nothing-to-digest');

  const child = await ctx.execute({ goal: renderKnowledge(record) });
  if (!completed(child)) return runFailed(child);

  // What the digest was actually shown, which is what a claim is pinned to: the
  // record may have dropped a known item to fit the budget.
  const hashOf = new Map(
    hits.map((hit) => [`${hit.source.runId}|${hit.source.ref}`, hit.contentHash]),
  );
  const shown: KnownRef[] = record.known.flatMap((item) => {
    const contentHash = hashOf.get(`${item.runId}|${item.ref}`);
    return contentHash === undefined
      ? []
      : [{ alias: item.alias, point: { runId: item.runId, ref: item.ref }, contentHash }];
  });

  const readout = readKnowledgeDigest(outputsOf(child.trace), acceptAt, shown);
  const report: KnowledgeDigestReportDto = {
    source: { pipeline: summary.id, version: summary.version },
    known: shown.length,
  };
  const reported = { ...report };
  const counts = {
    items: readout.proposed,
    kept: readout.memories.length,
    confirming: readout.memories.filter((item) => !item.storable).length,
  };
  if (readout.admission !== 'admitted') {
    return {
      status: 'complete',
      reason: UNADMITTED_REASON[readout.admission],
      counts,
      report: reported,
    };
  }
  if (readout.memories.length === 0) {
    return { status: 'complete', reason: 'no-items', counts, report: reported };
  }
  return {
    status: 'complete',
    counts,
    report: reported,
    output: {
      digestRunId: child.runId,
      items: readout.memories,
      dimensions: dimensionMapOf(summary.policy),
      unresolved: readout.unresolved,
    },
  };
}

/** Store what the digest endorsed, and record what it claimed about what was already there. */
export async function store(ctx: Ctx): Promise<StepResult<undefined>> {
  const source = ctx.outputs.target;
  const digested = ctx.outputs.digest;
  if (source === undefined) return skip('upstream-skipped', 'target');
  if (digested === undefined) return skip('upstream-skipped', 'digest');
  const context = contextOf(ctx);
  const model = ctx.ports.embeddings.model;
  const trace = traceOf(source);
  if (trace === null) return skip('nothing-to-digest');
  if (!context.store.ready || model === null) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  return indexKnowledge(ctx.ports, {
    source,
    trace,
    digestRunId: digested.digestRunId,
    items: digested.items,
    dimensions: digested.dimensions,
    origin: originOf(source, trace),
    model,
    unresolved: digested.unresolved,
  });
}
