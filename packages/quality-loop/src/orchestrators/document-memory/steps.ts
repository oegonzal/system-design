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
  Admission,
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
import { readDocumentDigest, UNIT_UNNAMED } from './read-document-digest';
import { DEFAULT_CHUNK_KIND, type OwnedKinds } from '../memory/store/chunks';

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
 * The admissions a document digest is drawn on: admitted, and judged below
 * the bar yet not refuted — an artifact its validators passed, every memory a
 * confirmed finding withholds still withheld (`endorsedMemories`). A document
 * transcribes what someone stated, so a digest of it scored low for its
 * writing loses a fact the corpus can never answer with again; the experience
 * digest keeps the reader's strict default. Measured 2026-10-12: five of 103
 * answers the operator gave at forms ended `revise` or `retry` on their
 * one-section document — a figure without its unit, the unit of work "missed"
 * — were stored nowhere, and each question was asked again at the next form.
 */
export const DOCUMENT_MEMORY_ADMITS: readonly Admission[] = ['admitted', 'fell-short'];

/** What the step says of the memories it withheld as bound to a unit of work the document names none of. */
const unnamedNote = (withheld: number): string =>
  `${withheld} withheld: bound to a unit of work, in a document that names none`;

/**
 * Digest the chunk; yields the digest run and what it endorsed, or nothing
 * with the reason — and a digest that was never judged (no rubric derived,
 * nothing produced) says that, never `not-accepted`. Memories bound to a unit
 * of work in a document that names none are counted and give the step its
 * reason (`unit-unnamed`) whether or not the rest are stored: the chunk's facts
 * are not all in the store, and a reader that would replace what an earlier
 * digest of it stored must not read it as though they were. The report names
 * the document, read from the goal's own index, so a ledger of runs reads
 * which chunk of which document each one digested.
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
  const { admission, proposed, memories, withheld } = readDocumentDigest(
    outputsOf(child.trace),
    acceptAt,
    DOCUMENT_MEMORY_ADMITS,
  );
  const unnamed = withheld.filter((item) => item.by === UNIT_UNNAMED.by).length;
  const counts = {
    memories: proposed,
    kept: memories.length,
    ...(unnamed === 0 ? {} : { [UNIT_UNNAMED.by]: unnamed }),
  };
  const leftOut = unnamed === 0 ? null : { reason: UNIT_UNNAMED.by, note: unnamedNote(unnamed) };
  if (memories.length === 0) {
    if (leftOut !== null) return { status: 'complete', ...leftOut, counts, report };
    // Not drawn on at all — or drawn on below the bar and nothing survived the engine's gates.
    if (admission !== 'admitted') {
      return { status: 'complete', reason: UNADMITTED_REASON[admission], counts, report };
    }
    return { status: 'complete', reason: 'no-memories', counts, report };
  }
  const notes = [
    ...(admission === 'admitted' ? [] : ['judged below the bar, not refuted: stored']),
    ...(leftOut === null ? [] : [leftOut.note]),
  ];
  return {
    status: 'complete',
    counts,
    report,
    ...(leftOut === null ? {} : { reason: leftOut.reason }),
    ...(notes.length === 0 ? {} : { note: notes.join('; ') }),
    output: { source: child, digested: { digestRunId: child.runId, memories } },
  };
}

/**
 * The kinds this writer owns under a source run: every kind a document digest
 * may declare, and the lessons it wrote before it declared any. All of them, so
 * a re-digest that drops a kind the last one wrote replaces that point instead
 * of orphaning it.
 *
 * Named rather than built inline at the call because the ORDER is behaviour: the
 * first kind is where a memory declaring one this writer does not own is filed,
 * and the lesson belongs there because it is what this writer's older points
 * already are. Sorting this list would move every future stray onto another
 * shelf while keeping the type satisfied, so a spec asserts where a stray lands
 * through this very constant — a comment could not have caught it.
 */
export const DOCUMENT_MEMORY_OWNED: OwnedKinds = [DEFAULT_CHUNK_KIND, ...DOCUMENT_MEMORY_KINDS];

/** Store what the digest endorsed as the digest run's own memory. */
export async function store(ctx: Ctx): Promise<StepResult<undefined>> {
  const digested = ctx.outputs.digest;
  if (digested === undefined) return skip('upstream-skipped', 'digest');
  const context = contextOf(ctx);
  const model = ctx.ports.embeddings.model;
  if (!context.store.ready || model === null) {
    return skip('store-unavailable', context.store.note ?? context.store.reason);
  }
  return indexMemories(ctx.ports, digested.source, digested.digested, model, DOCUMENT_MEMORY_OWNED);
}
