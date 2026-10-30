import type { MemoryPolicy, MemoryService } from '@sysdesign/agentic-memory';
import {
  memoryStrategySchema,
  type CompileReportDto,
  type EnsuredSpaceDto,
  type MemorySpaceDto,
} from '@sysdesign/contracts';
import { bestArtifact, type LoopClient } from '@sysdesign/loop-client';

import { HostRefused } from './host-refusal';

/**
 * A memory space made from a design run: the run read from the loop, its best
 * iteration's strategy read leniently — the way the loop kept it — and handed
 * to the runtime with the policy every new space snapshots and the name of the
 * settings it came from. The runtime compiles it and keeps the space, or
 * answers the compile report that says why it would not. A space is made with
 * no name, or ensured under one: then the runtime answers the space that run
 * made before without the run being read again, and refuses a name another
 * run holds; the run is read only where a space is to be made.
 */
export class SpacesService {
  constructor(
    private readonly runs: Pick<LoopClient, 'getRun'>,
    private readonly memory: Pick<MemoryService, 'createSpace' | 'ensureSpace'>,
    private readonly policy: MemoryPolicy,
    private readonly policySource: string,
  ) {}

  async createFromRun(
    runId: string,
  ): Promise<{ space: MemorySpaceDto } | { report: CompileReportDto }> {
    return this.memory.createSpace({
      name: null,
      ...this.snapshot(runId),
      strategy: await this.strategyOf(runId),
    });
  }

  async ensureNamed(
    name: string,
    runId: string,
  ): Promise<EnsuredSpaceDto | { report: CompileReportDto }> {
    return this.memory.ensureSpace({
      name,
      ...this.snapshot(runId),
      strategy: () => this.strategyOf(runId),
    });
  }

  /** What every new space snapshots beside its strategy: the run it came from, the policy and the settings the policy came from. */
  private snapshot(runId: string) {
    return { designRunId: runId, policy: this.policy, policySource: this.policySource };
  }

  /** The run's strategy as the loop kept it — or the host's refusal: no such run, one still running, one holding no strategy that reads. */
  private async strategyOf(runId: string) {
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
    return strategy;
  }
}
