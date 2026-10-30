import {
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  errorMessage,
  type OrchestrationRunDto,
} from '@sysdesign/contracts';
import {
  awaitOrchestration,
  LoopRefused,
  LoopTimeout,
  LoopUnreachable,
  type AwaitOptions,
  type LoopClient,
} from '@sysdesign/loop-client';

import {
  POSTING_STEPS,
  SinkFault,
  type IngestSink,
  type ManifestEntry,
  type ManifestStep,
  type PlannedChunk,
  type PostingOutcome,
  type PostingStep,
} from '../../core/ports';

/** How many times the digest may revise before the loop settles on its best; two is one correction. */
export const INGEST_MAX_ITERATIONS = 2;

/** The document-memory orchestrator's step that carries out each phase of a posting, as the manifest names the phases. */
const LOOP_STEPS: Record<PostingStep, string> = { digest: 'digest', store: 'store' };

/** A loop step as the manifest summarizes it; null for one the orchestration never reported. */
const summarizeStep = (
  orchestration: OrchestrationRunDto,
  phase: PostingStep,
): ManifestStep | null => {
  const step = orchestration.steps[LOOP_STEPS[phase]];
  return step
    ? { status: step.status, reason: step.reason, note: step.note, counts: step.counts }
    : null;
};

/**
 * The orchestration as a posting's outcome: the loop's two steps are the
 * manifest's two phases, and what it stored is named by the digest step's
 * child run — the id every point it stored carries — so the outcome names no
 * records.
 */
export const outcomeOf = (orchestration: OrchestrationRunDto): PostingOutcome => {
  const digest = orchestration.steps[LOOP_STEPS.digest];
  return {
    orchestrationRunId: orchestration.orchestrationRunId,
    status: orchestration.status,
    digestRunId: digest?.runIds[digest.runIds.length - 1] ?? null,
    steps: Object.fromEntries(
      POSTING_STEPS.map((phase) => [phase, summarizeStep(orchestration, phase)]),
    ) as PostingOutcome['steps'],
    error: orchestration.error?.message ?? null,
    recordIds: [],
  };
};

/** The loop client's failures as the port's: a refusal by its status and the loop's own words, the rest by their message; anything else as it is. */
const loopFault = (error: unknown): unknown => {
  if (error instanceof LoopRefused) {
    return new SinkFault('refused', `${error.status}: ${error.message}`);
  }
  if (error instanceof LoopUnreachable) return new SinkFault('unreachable', error.message);
  if (error instanceof LoopTimeout) return new SinkFault('timeout', error.message);
  return error;
};

/**
 * The loop over the shared client: start the document-memory orchestration
 * on the chunk's rendered goal, then wait for it to settle the way every
 * program waits — by heartbeat, through `awaitOrchestration`. A start the
 * loop refuses is the port's refusal; a wait that fails after the start is an
 * unfinished posting, so the caller still has the orchestration id to record.
 * What a posting stored is taken out by its digest run's id, the id every
 * point of it carries: the loop's store keeps no record ids, so none is kept
 * for another posting's sake.
 */
export class LoopIngestSink implements IngestSink {
  readonly kind = 'loop' as const;
  readonly spaceId = null;
  readonly scope = null;

  constructor(
    private readonly client: LoopClient,
    readonly host: string,
    private readonly awaiting: AwaitOptions = {},
  ) {}

  async post(planned: PlannedChunk): Promise<PostingOutcome> {
    let orchestrationRunId: string;
    try {
      const started = await this.client.startOrchestration(DOCUMENT_MEMORY_ORCHESTRATOR_ID, {
        goal: planned.goal,
        maxIterations: INGEST_MAX_ITERATIONS,
      });
      orchestrationRunId = started.orchestrationRunId;
    } catch (error) {
      throw loopFault(error);
    }
    try {
      return outcomeOf(await awaitOrchestration(this.client, orchestrationRunId, this.awaiting));
    } catch (error) {
      throw new SinkFault('unfinished', errorMessage(error), orchestrationRunId);
    }
  }

  async status(entry: ManifestEntry): Promise<PostingOutcome | null> {
    if (entry.orchestrationRunId === null) return null;
    try {
      const orchestration = await this.client.getOrchestration(entry.orchestrationRunId);
      return orchestration === null ? null : outcomeOf(orchestration);
    } catch (error) {
      throw loopFault(error);
    }
  }

  async retract(entry: ManifestEntry): Promise<number> {
    if (entry.digestRunId === null) return 0;
    try {
      return (await this.client.retractMemory(entry.digestRunId)).removed;
    } catch (error) {
      throw loopFault(error);
    }
  }
}
