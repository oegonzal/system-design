/**
 * The document-memory orchestrator's two steps, as adapters over its ports.
 * `digest` runs the document-digest pipeline over the chunk the request
 * carries and reads back what it endorsed; `store` writes that to the memory
 * store with the digest run as its own source — the run id is the
 * replacement namespace, and `pipeline` stamps `document-digest` on every
 * point, which is how a fact about a person is told from a lesson about a
 * design. Each step decides its own closed reason; the runner owns the
 * ledger, the cascade and the child ids.
 */
import type {
  DocumentDigestReportDto,
  DocumentMemoryStepReason,
  MemoryContextDto,
  QualityRunDto,
} from '@sysdesign/contracts';
import { DEFAULT_QUALITY_RUN_ITERATIONS, DOCUMENT_MEMORY_KINDS } from '@sysdesign/contracts';

import { outputsOf } from '../../core/outputs';
import { DOCUMENT_DIGEST_ID, readIndex } from '../../pipelines/document-digest/input';
import { completed, requestInput, runFailed, skipped } from '../common';
import type { Digested } from '../memory/digest/endorsed';
import { indexMemories } from '../memory/store/index-memories';
import { UNADMITTED_REASON } from '../memory/unadmitted';
import type { StepContext, StepResult } from '../runner/definition';
import type { DocumentMemoryPorts } from './ports';
import { readDocumentDigest } from './read-document-digest';
import { DEFAULT_CHUNK_KIND } from '../memory/store/chunks';

/** What each step hands on. The digest run is its own source, so `store` needs nothing else. */
export interface DocumentMemoryOutputs {
  digest: { source: QualityRunDto; digested: Digested };
  store: undefined;
}

type Ctx = StepContext<DocumentMemoryOutputs, DocumentMemoryPorts>;

/** A skip for one of the orchestrator's declared reasons, or the runner's two that a step may give itself. */
const skip = (
  reason: DocumentMemoryStepReason | 'pipeline-unavailable' | 'upstream-skipped',
  note: string | null = null,
): StepResult<never> => skipped(reason, note);

const contextOf = (ctx: Ctx): MemoryContextDto => ctx.context as unknown as MemoryContextDto;

/**
 * Digest the chunk; yields the digest run and what it endorsed, or nothing
 * with the reason — and a digest that was never judged (no rubric derived,
 * nothing produced) says that, never `not-accepted`. The report names the
 * document, read from the goal's own index, so a ledger of runs reads which
 * chunk of which document each one digested.
 */
export async function digest(ctx: Ctx): Promise<StepResult<DocumentMemoryOutputs['digest']>> {
  if (!ctx.ports.embeddings.enabled) {
    return skip('embeddings-disabled', contextOf(ctx).embedding.reason);
  }
  const acceptAt = ctx.acceptAtOf(DOCUMENT_DIGEST_ID);
  if (acceptAt === null) return skip('pipeline-unavailable', DOCUMENT_DIGEST_ID);
  const index = readIndex(ctx.request.goal);
  // The definition refuses a goal without an index before a row exists; here it is a fault, not a reason.
  if (index === null) throw new Error(`the goal carries no ${DOCUMENT_DIGEST_ID} index`);
  const report: DocumentDigestReportDto = { ...index.document };

  const child = await ctx.execute({
    ...requestInput(ctx.request),
    maxIterations: ctx.request.maxIterations ?? DEFAULT_QUALITY_RUN_ITERATIONS,
  });
  if (!completed(child)) return runFailed(child);
  const { admission, proposed, memories } = readDocumentDigest(outputsOf(child.trace), acceptAt);
  const counts = { memories: proposed, kept: memories.length };
  if (admission !== 'admitted') {
    return { status: 'complete', reason: UNADMITTED_REASON[admission], counts, report };
  }
  if (memories.length === 0) return { status: 'complete', reason: 'no-memories', counts, report };
  return {
    status: 'complete',
    counts,
    report,
    output: { source: child, digested: { digestRunId: child.runId, memories } },
  };
}

/** Store what the digest endorsed as the digest run's own memory. */
export async function store(ctx: Ctx): Promise<StepResult<undefined>> {
  const digested = ctx.outputs.digest;
  if (digested === undefined) return skip('upstream-skipped', 'digest');
  const context = contextOf(ctx);
  const model = ctx.ports.embeddings.model;
  if (!context.store.ready || model === null) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  // A document digest may write any of its declared kinds, and wrote lessons
  // before it declared any. All of them, so a re-digest that drops a kind the
  // last one wrote replaces that point rather than orphaning it.
  // The order is not cosmetic: the first kind is where a memory declaring one
  // this writer does not own is filed, and lessons are this writer's older points.
  return indexMemories(ctx.ports, digested.source, digested.digested, model, [
    DEFAULT_CHUNK_KIND,
    ...DOCUMENT_MEMORY_KINDS,
  ]);
}
