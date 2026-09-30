import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import type { RunRepository } from '../../core/ports';
import { ORCHESTRATION_RUN_REPOSITORY } from '../orchestration/tokens';
import type { OrchestrationRunRepository } from '../orchestration/ports';
import { RUN_REPOSITORY } from '../runs/tokens';
import type { RunJanitorOptions } from './stale-after';
import { RUN_JANITOR_OPTIONS } from './tokens';

/**
 * The one sweeper (ENG-10). A running row is another process's until its
 * heartbeat goes stale; only then is it failed as Interrupted — at boot and
 * on an interval, never from a process that only reads runs. A row this sweep
 * failed is reclaimed by that process's close() if it ever arrives, so the
 * record ends in the truth.
 */
@Injectable()
export class RunJanitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunJanitor.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(RUN_JANITOR_OPTIONS) private readonly options: RunJanitorOptions,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(ORCHESTRATION_RUN_REPOSITORY)
    private readonly orchestrations: OrchestrationRunRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sweep();
    if (this.options.intervalMs !== null) {
      this.timer = setInterval(() => void this.sweep(), this.options.intervalMs);
      // A CLI run must still exit when its work is done.
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  /** Fail every run and orchestration run whose heartbeat is older than the threshold. */
  async sweep(): Promise<{ runs: number; orchestrations: number }> {
    const before = new Date(Date.now() - this.options.staleAfterMs);
    try {
      const runs = await this.runs.failStale(before);
      const orchestrations = await this.orchestrations.failStale(before);
      if (runs + orchestrations > 0) {
        this.logger.warn(
          `failed ${runs} run(s) and ${orchestrations} orchestration run(s) whose heartbeat is older than ${this.options.staleAfterMs} ms`,
        );
      }
      return { runs, orchestrations };
    } catch (error) {
      this.logger.error(`sweep failed: ${String(error)}`);
      return { runs: 0, orchestrations: 0 };
    }
  }
}
