import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '@sysdesign/contracts';

import { CLOCK, type Clock } from '../common/clock';
import {
  cycleDto,
  type CyclePatch,
  type MemoryDesignCycle,
  type MemoryDesignCycleDto,
} from './cycle';
import { MemoryDesignDriver } from './driver';
import { CYCLE_STORE, EVENT_SINK, type CycleStore, type DesignEventSink } from './ports';

/** A brief's digest: cycles over the same brief share it, and the brief itself stays on the run. */
const digestOf = (goal: string): string =>
  createHash('sha256').update(goal).digest('hex').slice(0, 32);

/**
 * The design cycle, start to store. A cycle is long-running — a coach run is
 * minutes — so `start` only records a running row and returns at once; the
 * controller fires `execute` detached, and it advances the row as it goes.
 * Every failure is recorded on the row and ends nothing else: learning from a
 * run is best-effort, never on the critical path of the design. Each status
 * transition is announced on the bus, fire-and-forget — a bus that is down
 * never fails a cycle.
 */
@Injectable()
export class DesignsService {
  private readonly logger = new Logger(DesignsService.name);

  constructor(
    @Inject(CYCLE_STORE) private readonly store: CycleStore,
    private readonly driver: MemoryDesignDriver,
    @Inject(EVENT_SINK) private readonly events: DesignEventSink,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Record a running cycle for a brief; the row is returned at once, before any work runs. */
  async start(goal: string): Promise<MemoryDesignCycleDto> {
    const now = this.clock();
    const cycle: MemoryDesignCycle = {
      id: randomUUID(),
      goalDigest: digestOf(goal),
      status: 'running',
      designRunId: null,
      orchestrationRunId: null,
      note: null,
      startedAt: now,
      updatedAt: now,
    };
    await this.store.insert(cycle);
    this.announce(cycle);
    return cycleDto(cycle);
  }

  async get(id: string): Promise<MemoryDesignCycleDto | null> {
    const cycle = await this.store.find(id);
    return cycle === null ? null : cycleDto(cycle);
  }

  /**
   * One cycle through: the brief in, a memory strategy coached on the loop (the
   * run's artifact, read back from the run — never parsed here), then the
   * finished run handed to the orchestrator to digest and store as lessons.
   * Awaitable so a spec drives it; `start` fires it detached and hands it the
   * goal, which the row does not keep.
   */
  async execute(id: string, goal: string): Promise<void> {
    const cycle = await this.store.find(id);
    if (cycle === null) return;
    try {
      const { runId } = await this.driver.coach(goal);
      await this.patch(id, { designRunId: runId });
      this.announce(await this.patch(id, { status: 'coached' }));
      const orchestrationRunId = await this.driver.learn(runId);
      this.announce(await this.patch(id, { status: 'stored', orchestrationRunId }));
    } catch (error) {
      const note = errorMessage(error);
      this.logger.warn(`cycle ${id} failed: ${note}`);
      await this.patch(id, { status: 'failed', note });
    }
  }

  private patch(
    id: string,
    fields: Omit<CyclePatch, 'updatedAt'>,
  ): Promise<MemoryDesignCycle | null> {
    return this.store.update(id, { ...fields, updatedAt: this.clock() });
  }

  /** Announce a transition on the bus; never fatal, never blocking. */
  private announce(cycle: MemoryDesignCycle | null): void {
    if (cycle === null) return;
    void this.events
      .emit(cycle)
      .catch((error: unknown) =>
        this.logger.warn(`cycle ${cycle.id}: event not published: ${errorMessage(error)}`),
      );
  }
}
