import type { MemoryPolicy, MemoryService } from '@sysdesign/agentic-memory';
import {
  memoryStrategySchema,
  type CompileReportDto,
  type MemorySpaceDto,
} from '@sysdesign/contracts';
import { bestArtifact, type LoopClient } from '@sysdesign/loop-client';

/**
 * Why a space cannot be made from a run: the loop has no such run, the run is
 * still going, or it holds no memory strategy that reads. The spaces service's
 * own vocabulary, beside the runtime's refusals; the HTTP door gives each one
 * declared status.
 */
export type RunRefusal = 'run.not_found' | 'run.in_flight' | 'run.no_strategy';

export class RunRefused extends Error {
  constructor(
    readonly code: RunRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'RunRefused';
  }
}

/**
 * A memory space made from a design run: the run read from the loop, its best
 * iteration's strategy read leniently — the way the loop kept it — and handed
 * to the runtime with the policy every new space snapshots and the name of the
 * settings it came from. The runtime compiles it and keeps the space, or
 * answers the compile report that says why it would not.
 */
export class SpacesService {
  constructor(
    private readonly runs: Pick<LoopClient, 'getRun'>,
    private readonly memory: Pick<MemoryService, 'createSpace'>,
    private readonly policy: MemoryPolicy,
    private readonly policySource: string,
  ) {}

  async createFromRun(
    runId: string,
  ): Promise<{ space: MemorySpaceDto } | { report: CompileReportDto }> {
    const run = await this.runs.getRun(runId);
    if (run === null) throw new RunRefused('run.not_found', `the quality loop has no run ${runId}`);
    if (run.status === 'running') {
      throw new RunRefused(
        'run.in_flight',
        `run ${runId} is still running; a space is made from a settled run`,
      );
    }
    const strategy = bestArtifact(run, memoryStrategySchema);
    if (strategy === null) {
      throw new RunRefused('run.no_strategy', `run ${runId} holds no memory strategy that reads`);
    }
    return this.memory.createSpace({
      designRunId: runId,
      strategy,
      policy: this.policy,
      policySource: this.policySource,
    });
  }
}
