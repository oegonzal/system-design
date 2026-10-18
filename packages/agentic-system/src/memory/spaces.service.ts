import type { MemoryPolicy, MemoryService } from '@sysdesign/agentic-memory';
import {
  memoryStrategySchema,
  type CompileReportDto,
  type MemorySpaceDto,
} from '@sysdesign/contracts';
import { bestArtifact, type LoopClient } from '@sysdesign/loop-client';

import { HostRefused } from './host-refusal';

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
    if (run === null) {
      throw new HostRefused('run.not_found', `the quality loop has no run ${runId}`);
    }
    if (run.status === 'running') {
      throw new HostRefused(
        'run.in_flight',
        `run ${runId} is still running; a space is made from a settled run`,
      );
    }
    const strategy = bestArtifact(run, memoryStrategySchema);
    if (strategy === null) {
      throw new HostRefused('run.no_strategy', `run ${runId} holds no memory strategy that reads`);
    }
    return this.memory.createSpace({
      designRunId: runId,
      strategy,
      policy: this.policy,
      policySource: this.policySource,
    });
  }
}
