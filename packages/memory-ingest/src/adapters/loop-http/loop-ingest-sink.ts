import { DOCUMENT_MEMORY_ORCHESTRATOR_ID, type OrchestrationRunDto } from '@sysdesign/contracts';
import { awaitOrchestration, type AwaitOptions, type LoopClient } from '@sysdesign/loop-client';

import { IngestWaitFailed, type IngestSink, type PlannedChunk } from '../../core/ports';

/** How many times the digest may revise before the loop settles on its best; two is one correction. */
export const INGEST_MAX_ITERATIONS = 2;

/**
 * The loop over the shared client: start the document-memory orchestration
 * on the chunk's rendered goal, then wait for it to settle the way every
 * program waits — by heartbeat, through `awaitOrchestration`. A start the
 * loop refuses throws the client's own error; a wait that fails after the
 * start is wrapped so the caller still has the orchestration id to record.
 */
export class LoopIngestSink implements IngestSink {
  constructor(
    private readonly client: LoopClient,
    private readonly awaiting: AwaitOptions = {},
  ) {}

  async post(planned: PlannedChunk): Promise<OrchestrationRunDto> {
    const started = await this.client.startOrchestration(DOCUMENT_MEMORY_ORCHESTRATOR_ID, {
      goal: planned.goal,
      maxIterations: INGEST_MAX_ITERATIONS,
    });
    try {
      return await awaitOrchestration(this.client, started.orchestrationRunId, this.awaiting);
    } catch (error) {
      throw new IngestWaitFailed(
        started.orchestrationRunId,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  status(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    return this.client.getOrchestration(orchestrationRunId);
  }

  async retract(digestRunId: string): Promise<number> {
    return (await this.client.retractMemory(digestRunId)).removed;
  }
}
