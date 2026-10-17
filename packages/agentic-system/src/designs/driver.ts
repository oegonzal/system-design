import { awaitOrchestration, awaitRun, type LoopClient } from '@sysdesign/loop-client';

import type { DesignSettings } from './settings';

/** What the coach produced: the run it ran in. The strategy itself is read from that run. */
export interface Coached {
  runId: string;
}

/**
 * Drives the loop for one design cycle, and nothing else: it starts the coach
 * run with coach-only recall (a per-run flag, the one recall an orchestration
 * cannot carry), waits for it honestly by its heartbeat, and — separately —
 * hands the finished run to the memory-design orchestrator to digest and store,
 * waiting for that too. Each step answers only once its work has completed, so
 * a cycle is never called coached, or stored, ahead of the fact; a run or an
 * orchestration that ends any other way throws, naming how it ended.
 * A pure class the service composes; the module builds it from the loop client
 * and the settings.
 */
export class MemoryDesignDriver {
  constructor(
    private readonly loop: LoopClient,
    private readonly settings: DesignSettings,
  ) {}

  /**
   * Coach a memory strategy: the brief in, a graded strategy out, under the
   * loop's own judging. No output is supplied — the memory-architecture pipeline
   * generates the strategy from the brief and derives its criteria from the
   * goal, so a cycle is graded on memory-design kinds. The strategy is the run's
   * artifact, read from the run (`GET /runs/:id`), not parsed here.
   */
  async coach(goal: string): Promise<Coached> {
    const started = await this.loop.startRun({
      pipeline: this.settings.pipeline,
      goal,
      maxIterations: this.settings.maxIterations,
      recall: this.settings.recall,
    });
    const settled = await awaitRun(this.loop, started.runId, {
      pollEveryMs: this.settings.pollEveryMs,
    });
    if (settled.status !== 'complete') {
      throw new Error(`the coach run ${started.runId} ended ${settled.status}`);
    }
    return { runId: started.runId };
  }

  /** Hand the finished coach run to the memory-design orchestrator; its id, for the record. */
  async learn(runId: string): Promise<string> {
    const { orchestrationRunId } = await this.loop.startOrchestrationFromRun(
      this.settings.orchestrator,
      { runId },
    );
    const settled = await awaitOrchestration(this.loop, orchestrationRunId, {
      pollEveryMs: this.settings.pollEveryMs,
    });
    if (settled.status !== 'complete') {
      throw new Error(
        `the ${this.settings.orchestrator} orchestration ${orchestrationRunId} ended ${settled.status}`,
      );
    }
    return orchestrationRunId;
  }
}
