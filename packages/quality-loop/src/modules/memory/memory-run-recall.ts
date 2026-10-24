/**
 * The memory module's recall for a run's own producer: the same recall the
 * memory orchestrator's first step runs, over the same ports, with the store
 * asked how it stands now rather than when an orchestration opened. A run
 * that adopted a judged iteration recalls for what is wrong with it and
 * screens out what its producer already holds of it — the chain walked
 * through the runs this process records. It binds itself into the runs
 * module's slot at init — the runs module never imports this one, which
 * already depends on it.
 */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { RunRecallDto } from '@sysdesign/contracts';

import { contentHash, type MemoryPorts } from '../../orchestrators/memory/ports';
import { focusOf } from '../../orchestrators/memory/recall/focus';
import { bareGoal } from '../../orchestrators/common';
import { knownOf, type RecallKnown } from '../../orchestrators/memory/recall/known';
import { resolveLineage } from '../../orchestrators/memory/recall/lineage';
import { provenanceOf } from '../../orchestrators/memory/recall/provenance';
import { recallMemory } from '../../orchestrators/memory/recall/recall-memory';
import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import type { ChildRunner, RecallBase, RunRecall, RunRecallSlot } from '../runs/recall/run-recall';
import { RunsService } from '../runs/runs.service';
import { RUN_RECALL_SLOT } from '../runs/tokens';
import { MEMORY_PORTS } from './tokens';

@Injectable()
export class MemoryRunRecall implements RunRecall, OnModuleInit {
  constructor(
    @Inject(MEMORY_PORTS) private readonly ports: MemoryPorts,
    private readonly runs: RunsService,
    @Inject(RUN_RECALL_SLOT) private readonly slot: RunRecallSlot,
  ) {}

  onModuleInit(): void {
    this.slot.bind(this);
  }

  async recall(goal: string, execute: ChildRunner, base?: RecallBase): Promise<RunRecallDto> {
    // Focused on what is wrong with the iteration the run starts from, when
    // it adopted one; the producer alone is handed what comes back.
    const bare = bareGoal(goal);
    const focus = base === undefined ? null : focusOf(base);
    const known = base === undefined ? null : await this.knownOf(base, bare);
    const recalled = await recallMemory(this.ports, {
      goal: bare,
      store: await this.ports.store.verify(),
      acceptAt: this.runs.summaryOf(MEMORY_RECALL_ID)?.policy.thresholds.acceptAt ?? null,
      execute: (input) => execute({ pipeline: MEMORY_RECALL_ID, goal: input.goal }),
      focus,
      known,
    });
    return provenanceOf(recalled, focus);
  }

  /**
   * What the producer holds: the base, the chain its run adopted from — one
   * recorded run read per link — and the hash of the bare goal, hashed as a
   * stored lesson's lineage hashes its own.
   */
  private async knownOf(base: RecallBase, goal: string): Promise<RecallKnown> {
    const chain = await resolveLineage(
      { runId: base.runId, iteration: base.iteration.iteration },
      base.adoptedFrom,
      async (runId) => (await this.runs.get(runId))?.request.adoptedFrom ?? null,
    );
    return knownOf(base, chain, contentHash(goal));
  }
}
