/**
 * The memory module's recall for a run's own producer: the same recall the
 * memory orchestrator's first step runs, over the same ports, with the store
 * asked how it stands now rather than when an orchestration opened. It binds
 * itself into the runs module's slot at init — the runs module never imports
 * this one, which already depends on it.
 */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { RunRecallDto } from '@sysdesign/contracts';

import type { MemoryPorts } from '../../orchestrators/memory/ports';
import { focusOf } from '../../orchestrators/memory/recall/focus';
import { bareGoal } from '../../orchestrators/memory/recall/inject';
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
    const focus = base === undefined ? null : focusOf(base);
    const recalled = await recallMemory(this.ports, {
      goal: bareGoal(goal),
      store: await this.ports.store.verify(),
      acceptAt: this.runs.summaryOf(MEMORY_RECALL_ID)?.policy.thresholds.acceptAt ?? null,
      execute: (input) => execute({ pipeline: MEMORY_RECALL_ID, goal: input.goal }),
      focus,
    });
    return provenanceOf(recalled, focus);
  }
}
